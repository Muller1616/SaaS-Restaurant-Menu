-- Custom QR styling fields (Basic+ / FR-1.2 Custom QR).
ALTER TABLE "branches" ADD COLUMN "qr_fg_color" TEXT;
ALTER TABLE "branches" ADD COLUMN "qr_bg_color" TEXT;
ALTER TABLE "branches" ADD COLUMN "qr_use_logo" BOOLEAN NOT NULL DEFAULT false;
