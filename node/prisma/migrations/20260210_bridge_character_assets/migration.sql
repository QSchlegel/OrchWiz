-- CreateTable
CREATE TABLE "BridgeCharacterAsset" (
    "id" TEXT NOT NULL,
    "role" "BridgeCrewRole" NOT NULL,
    "modelUrl" TEXT NOT NULL,
    "meshyTaskId" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BridgeCharacterAsset_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BridgeCharacterAsset_role_key" ON "BridgeCharacterAsset"("role");
