const fs = require("node:fs/promises");
const path = require("node:path");

async function exists(targetPath) {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function copyDir(src, dst) {
  await fs.mkdir(dst, { recursive: true });
  const entries = await fs.readdir(src, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const dstPath = path.join(dst, entry.name);

    if (entry.isDirectory()) {
      await copyDir(srcPath, dstPath);
      continue;
    }

    await fs.copyFile(srcPath, dstPath);
  }
}

async function afterPack(context) {
  const sourcePrismaClient = path.join(context.packager.projectDir, "node_modules", ".prisma", "client");
  const sourcePrismaPackage = path.join(context.packager.projectDir, "node_modules", "@prisma", "client");

  if (!(await exists(sourcePrismaClient))) {
    throw new Error(
      "Missing node_modules/.prisma/client. Run `npm run db:generate` before desktop build."
    );
  }
  if (!(await exists(sourcePrismaPackage))) {
    throw new Error("Missing node_modules/@prisma/client. Run `npm install` then `npm run db:generate`.");
  }

  let packagedAppRoot;
  if (context.electronPlatformName === "darwin") {
    const entries = await fs.readdir(context.appOutDir, { withFileTypes: true });
    const appBundle = entries.find((entry) => entry.isDirectory() && entry.name.endsWith(".app"));
    if (!appBundle) {
      throw new Error(`Unable to find .app bundle in ${context.appOutDir}`);
    }
    packagedAppRoot = path.join(context.appOutDir, appBundle.name, "Contents", "Resources", "app");
  } else {
    packagedAppRoot = path.join(context.appOutDir, "resources", "app");
  }

  const targetPrismaClient = path.join(packagedAppRoot, "node_modules", ".prisma", "client");
  const targetPrismaPackage = path.join(packagedAppRoot, "node_modules", "@prisma", "client");

  await copyDir(sourcePrismaClient, targetPrismaClient);
  await copyDir(sourcePrismaPackage, targetPrismaPackage);

  if (!(await exists(path.join(targetPrismaClient, "schema.prisma")))) {
    throw new Error("Prisma runtime copy failed: schema.prisma missing in packaged app.");
  }
  if (!(await exists(path.join(targetPrismaPackage, "package.json")))) {
    throw new Error("Prisma package copy failed: @prisma/client/package.json missing in packaged app.");
  }

  console.log(`[afterPack] Prisma runtime copied to ${targetPrismaClient}`);
  console.log(`[afterPack] Prisma package copied to ${targetPrismaPackage}`);
}

module.exports = afterPack;
module.exports.default = afterPack;
