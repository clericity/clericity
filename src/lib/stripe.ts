import Stripe from 'stripe'

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2026-05-27.dahlia',
})

export const STRIPE_PRICES: Record<string, string> = {
  basic:    process.env.STRIPE_PRICE_BASIC!,
  pro:      process.env.STRIPE_PRICE_PRO!,
  business: process.env.STRIPE_PRICE_BUSINESS!,
}
