#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import path from "node:path";
import os from "node:os";
import fs from "node:fs";

import { PrismaClient } from "@prisma/client";

function getArg(name) {
  const index = process.argv.indexOf(name);
  if (index === -1) return null;
  return process.argv[index + 1] ?? null;
}

const apply = process.argv.includes("--apply");
const sourceArg = getArg("--source");
const defaultSource = path.join(
  os.homedir(),
  "Library",
  "Application Support",
  "pet-retailer-crm",
  "data",
  "petcrm.db"
);
const sourceDbPath = sourceArg || defaultSource;

if (!fs.existsSync(sourceDbPath)) {
  console.error(`Source desktop DB not found at: ${sourceDbPath}`);
  process.exit(1);
}

function canonicalName(name) {
  return String(name || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function cleanText(value) {
  if (value === null || value === undefined) return null;
  const out = String(value).trim();
  return out.length > 0 ? out : null;
}

function parseDateValue(value) {
  if (value === null || value === undefined || value === "") return null;

  if (typeof value === "number") {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  const raw = String(value).trim();
  if (!raw) return null;

  if (/^\d+$/.test(raw)) {
    const asInt = Number(raw);
    const d = new Date(asInt);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function parseJsonStringArray(value) {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value
      .map((item) => String(item).trim())
      .filter(Boolean);
  }

  try {
    const parsed = JSON.parse(String(value));
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item) => String(item).trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

function mergeUnique(left, right) {
  const out = new Set([
    ...left.map((item) => String(item).trim()).filter(Boolean),
    ...right.map((item) => String(item).trim()).filter(Boolean)
  ]);
  return [...out];
}

function sqliteJson(query) {
  const output = execFileSync("sqlite3", ["-json", sourceDbPath, query], {
    encoding: "utf8"
  });
  if (!output.trim()) return [];
  return JSON.parse(output);
}

function taskKey(task) {
  const dueDate = parseDateValue(task.due_date);
  const due = dueDate ? dueDate.toISOString().slice(0, 10) : "none";
  return [
    task.retailer_id,
    String(task.title || "").trim().toLowerCase(),
    String(task.action_type || "").trim().toUpperCase(),
    due,
    String(task.status || "").trim().toUpperCase()
  ].join("|");
}

function activityKey(activity) {
  const createdAt = parseDateValue(activity.created_at);
  const created = createdAt ? createdAt.toISOString() : "none";
  return [
    activity.retailer_id,
    String(activity.type || "").trim().toUpperCase(),
    String(activity.summary || "").trim(),
    created
  ].join("|");
}

function buildRetailerCreate(sourceRetailer) {
  const tags = parseJsonStringArray(sourceRetailer.tags);
  const products = parseJsonStringArray(sourceRetailer.products_carried);
  const support = parseJsonStringArray(sourceRetailer.support_needed);

  return {
    name: cleanText(sourceRetailer.name) || "Unnamed retailer",
    address: cleanText(sourceRetailer.address),
    city: cleanText(sourceRetailer.city),
    region: cleanText(sourceRetailer.region),
    postal_code: cleanText(sourceRetailer.postal_code),
    phone: cleanText(sourceRetailer.phone),
    primary_contact_name: cleanText(sourceRetailer.primary_contact_name),
    primary_contact_email: cleanText(sourceRetailer.primary_contact_email),
    primary_contact_phone: cleanText(sourceRetailer.primary_contact_phone),
    stage: cleanText(sourceRetailer.stage) || "LEAD_IDENTIFIED",
    tags: JSON.stringify(tags),
    products_carried: JSON.stringify(products),
    first_order_date: parseDateValue(sourceRetailer.first_order_date),
    last_order_date: parseDateValue(sourceRetailer.last_order_date),
    blocker: cleanText(sourceRetailer.blocker),
    support_needed: JSON.stringify(support),
    notes: cleanText(sourceRetailer.notes) || "",
    is_at_risk: Boolean(sourceRetailer.is_at_risk)
  };
}

function buildRetailerUpdate(sourceRetailer, targetRetailer) {
  const update = {};
  const sourceUpdatedAt = parseDateValue(sourceRetailer.updated_at);
  const targetUpdatedAt = parseDateValue(targetRetailer.updated_at);
  const preferSource =
    sourceUpdatedAt && targetUpdatedAt ? sourceUpdatedAt.getTime() > targetUpdatedAt.getTime() : true;

  const syncField = (field) => {
    const sourceValue = cleanText(sourceRetailer[field]);
    const targetValue = cleanText(targetRetailer[field]);

    if (!sourceValue) return;
    if (!targetValue || (preferSource && sourceValue !== targetValue)) {
      update[field] = sourceValue;
    }
  };

  [
    "address",
    "city",
    "region",
    "postal_code",
    "phone",
    "primary_contact_name",
    "primary_contact_email",
    "primary_contact_phone",
    "blocker"
  ].forEach(syncField);

  const sourceStage = cleanText(sourceRetailer.stage);
  if (sourceStage && (preferSource || !targetRetailer.stage)) {
    update.stage = sourceStage;
  }

  const sourceFirst = parseDateValue(sourceRetailer.first_order_date);
  const targetFirst = parseDateValue(targetRetailer.first_order_date);
  if (sourceFirst && (!targetFirst || preferSource)) {
    update.first_order_date = sourceFirst;
  }

  const sourceLast = parseDateValue(sourceRetailer.last_order_date);
  const targetLast = parseDateValue(targetRetailer.last_order_date);
  if (sourceLast && (!targetLast || preferSource)) {
    update.last_order_date = sourceLast;
  }

  const mergedTags = mergeUnique(
    parseJsonStringArray(targetRetailer.tags),
    parseJsonStringArray(sourceRetailer.tags)
  );
  if (JSON.stringify(mergedTags) !== JSON.stringify(parseJsonStringArray(targetRetailer.tags))) {
    update.tags = JSON.stringify(mergedTags);
  }

  const mergedProducts = mergeUnique(
    parseJsonStringArray(targetRetailer.products_carried),
    parseJsonStringArray(sourceRetailer.products_carried)
  );
  if (JSON.stringify(mergedProducts) !== JSON.stringify(parseJsonStringArray(targetRetailer.products_carried))) {
    update.products_carried = JSON.stringify(mergedProducts);
  }

  const mergedSupport = mergeUnique(
    parseJsonStringArray(targetRetailer.support_needed),
    parseJsonStringArray(sourceRetailer.support_needed)
  );
  if (JSON.stringify(mergedSupport) !== JSON.stringify(parseJsonStringArray(targetRetailer.support_needed))) {
    update.support_needed = JSON.stringify(mergedSupport);
  }

  const sourceNotes = cleanText(sourceRetailer.notes);
  const targetNotes = cleanText(targetRetailer.notes) || "";
  if (sourceNotes && !targetNotes.includes(sourceNotes)) {
    update.notes = targetNotes ? `${targetNotes}\n\n${sourceNotes}` : sourceNotes;
  }

  if (typeof sourceRetailer.is_at_risk === "number") {
    update.is_at_risk = Boolean(sourceRetailer.is_at_risk);
  }

  return update;
}

async function main() {
  const prisma = new PrismaClient();

  try {
    const sourceRetailers = sqliteJson("SELECT * FROM Retailer ORDER BY id ASC;");
    const sourceTasks = sqliteJson("SELECT * FROM Task ORDER BY id ASC;");
    const sourceActivities = sqliteJson("SELECT * FROM Activity ORDER BY id ASC;");

    const [targetRetailers, targetTasks, targetActivities] = await Promise.all([
      prisma.retailer.findMany(),
      prisma.task.findMany(),
      prisma.activity.findMany()
    ]);

    const targetByName = new Map(
      targetRetailers.map((retailer) => [canonicalName(retailer.name), retailer])
    );

    const idMap = new Map();
    const retailerCreates = [];
    const retailerUpdates = [];

    for (const sourceRetailer of sourceRetailers) {
      const key = canonicalName(sourceRetailer.name);
      const existing = targetByName.get(key);

      if (!existing) {
        retailerCreates.push(sourceRetailer);
        continue;
      }

      idMap.set(sourceRetailer.id, existing.id);
      const updateData = buildRetailerUpdate(sourceRetailer, existing);
      if (Object.keys(updateData).length > 0) {
        retailerUpdates.push({
          id: existing.id,
          data: updateData
        });
      }
    }

    const taskKeySet = new Set(targetTasks.map((task) => taskKey(task)));
    const activityKeySet = new Set(targetActivities.map((activity) => activityKey(activity)));

    let createdRetailers = 0;
    let updatedRetailers = 0;
    let createdTasks = 0;
    let createdActivities = 0;

    if (!apply) {
      // Dry-run report only
      for (const sourceRetailer of retailerCreates) {
        const key = canonicalName(sourceRetailer.name);
        if (!targetByName.has(key)) {
          const tmpId = -(sourceRetailer.id || Math.floor(Math.random() * 100000));
          idMap.set(sourceRetailer.id, tmpId);
        }
      }

      for (const sourceTask of sourceTasks) {
        const mappedRetailerId = idMap.get(sourceTask.retailer_id);
        if (!mappedRetailerId) continue;
        const normalized = {
          ...sourceTask,
          retailer_id: mappedRetailerId
        };
        if (!taskKeySet.has(taskKey(normalized))) {
          createdTasks += 1;
        }
      }

      for (const sourceActivity of sourceActivities) {
        const mappedRetailerId = idMap.get(sourceActivity.retailer_id);
        if (!mappedRetailerId) continue;
        const normalized = {
          ...sourceActivity,
          retailer_id: mappedRetailerId
        };
        if (!activityKeySet.has(activityKey(normalized))) {
          createdActivities += 1;
        }
      }

      console.log("Desktop -> Neon merge (dry-run)");
      console.log(`Source DB: ${sourceDbPath}`);
      console.log(`Would create retailers: ${retailerCreates.length}`);
      console.log(`Would update retailers: ${retailerUpdates.length}`);
      console.log(`Would create tasks: ${createdTasks}`);
      console.log(`Would create activities: ${createdActivities}`);
      console.log("");
      console.log("Run again with --apply to execute changes.");
      return;
    }

    for (const sourceRetailer of retailerCreates) {
      const created = await prisma.retailer.create({
        data: buildRetailerCreate(sourceRetailer)
      });
      idMap.set(sourceRetailer.id, created.id);
      createdRetailers += 1;
    }

    for (const update of retailerUpdates) {
      await prisma.retailer.update({
        where: { id: update.id },
        data: update.data
      });
      updatedRetailers += 1;
    }

    const openTaskKeySet = new Set(taskKeySet);
    for (const sourceTask of sourceTasks) {
      const mappedRetailerId = idMap.get(sourceTask.retailer_id);
      if (!mappedRetailerId) continue;

      const normalized = {
        ...sourceTask,
        retailer_id: mappedRetailerId
      };
      const key = taskKey(normalized);
      if (openTaskKeySet.has(key)) continue;

      await prisma.task.create({
        data: {
          retailer_id: mappedRetailerId,
          title: cleanText(sourceTask.title) || "Imported task",
          action_type: cleanText(sourceTask.action_type) || "CALL",
          due_date: parseDateValue(sourceTask.due_date) || new Date(),
          status: cleanText(sourceTask.status) || "OPEN",
          completed_at: parseDateValue(sourceTask.completed_at)
        }
      });

      openTaskKeySet.add(key);
      createdTasks += 1;
    }

    const openActivityKeySet = new Set(activityKeySet);
    for (const sourceActivity of sourceActivities) {
      const mappedRetailerId = idMap.get(sourceActivity.retailer_id);
      if (!mappedRetailerId) continue;

      const normalized = {
        ...sourceActivity,
        retailer_id: mappedRetailerId
      };
      const key = activityKey(normalized);
      if (openActivityKeySet.has(key)) continue;

      await prisma.activity.create({
        data: {
          retailer_id: mappedRetailerId,
          type: cleanText(sourceActivity.type) || "NOTE",
          summary: cleanText(sourceActivity.summary) || "Imported activity",
          created_at: parseDateValue(sourceActivity.created_at) || new Date()
        }
      });

      openActivityKeySet.add(key);
      createdActivities += 1;
    }

    console.log("Desktop -> Neon merge complete");
    console.log(`Source DB: ${sourceDbPath}`);
    console.log(`Created retailers: ${createdRetailers}`);
    console.log(`Updated retailers: ${updatedRetailers}`);
    console.log(`Created tasks: ${createdTasks}`);
    console.log(`Created activities: ${createdActivities}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error("Import failed:", error);
  process.exit(1);
});
