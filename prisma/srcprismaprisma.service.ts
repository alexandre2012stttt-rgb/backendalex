model Subscription {
  id             String              @id @default(cuid())
  code           String              @unique
  status         SubscriptionStatus  @default(PENDING)
  expiresAt      DateTime?
  telegramUserId String?
  createdAt      DateTime            @default(now())
  updatedAt      DateTime            @updatedAt

  paymentId      String?   @unique
  payment        Payment?  @relation(fields: [paymentId], references: [id])

  planId         String?
  plan           Plan?     @relation(fields: [planId], references: [id])
}
