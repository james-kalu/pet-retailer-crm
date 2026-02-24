-- CreateTable
CREATE TABLE "Retailer" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT,
    "city" TEXT,
    "region" TEXT,
    "postal_code" TEXT,
    "phone" TEXT,
    "primary_contact_name" TEXT,
    "primary_contact_email" TEXT,
    "primary_contact_phone" TEXT,
    "stage" TEXT NOT NULL DEFAULT 'LEAD_IDENTIFIED',
    "tags" TEXT NOT NULL DEFAULT '[]',
    "products_carried" TEXT NOT NULL DEFAULT '[]',
    "first_order_date" TIMESTAMP(3),
    "last_order_date" TIMESTAMP(3),
    "blocker" TEXT,
    "support_needed" TEXT NOT NULL DEFAULT '[]',
    "notes" TEXT NOT NULL DEFAULT '',
    "is_at_risk" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Retailer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Task" (
    "id" SERIAL NOT NULL,
    "retailer_id" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "action_type" TEXT NOT NULL,
    "due_date" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Task_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Activity" (
    "id" SERIAL NOT NULL,
    "retailer_id" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Activity_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Retailer_stage_idx" ON "Retailer"("stage");

-- CreateIndex
CREATE INDEX "Retailer_last_order_date_idx" ON "Retailer"("last_order_date");

-- CreateIndex
CREATE INDEX "Retailer_is_at_risk_idx" ON "Retailer"("is_at_risk");

-- CreateIndex
CREATE INDEX "Task_retailer_id_idx" ON "Task"("retailer_id");

-- CreateIndex
CREATE INDEX "Task_due_date_idx" ON "Task"("due_date");

-- CreateIndex
CREATE INDEX "Task_status_idx" ON "Task"("status");

-- CreateIndex
CREATE INDEX "Activity_retailer_id_idx" ON "Activity"("retailer_id");

-- CreateIndex
CREATE INDEX "Activity_created_at_idx" ON "Activity"("created_at");

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_retailer_id_fkey" FOREIGN KEY ("retailer_id") REFERENCES "Retailer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Activity" ADD CONSTRAINT "Activity_retailer_id_fkey" FOREIGN KEY ("retailer_id") REFERENCES "Retailer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
