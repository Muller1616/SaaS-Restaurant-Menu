import { z } from "zod";

export const registrationSchema = z.object({
  fullName: z.string().trim().min(2, "Full name is required"),
  email: z.email("Valid email is required"),
  phone: z.string().trim().min(7, "Phone number is required"),
  businessName: z.string().trim().min(2, "Business name is required"),
  businessLocation: z.string().trim().min(2, "Business location is required"),
  businessDescription: z.string().trim().optional(),
  planSlug: z.enum(["free", "basic", "popular", "premium"]),
  paymentMethod: z.enum(["BANK_TRANSFER", "TELEBIRR", "CASH"]).optional(),
  referenceNumber: z.string().trim().optional(),
});

export type RegistrationInput = z.infer<typeof registrationSchema>;
