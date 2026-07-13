# AI Frontend Interview Coach

A [Next.js](https://nextjs.org) application for AI-powered frontend interview coaching.

## Prerequisites

- [Node.js](https://nodejs.org) 20 or newer
- An [OpenRouter](https://openrouter.ai/settings/keys) API key

## Getting Started

1. **Install dependencies:**

   ```bash
   npm install
   ```

2. **Configure environment variables.** Create a `.env` file in the project root:

   ```bash
   OPENROUTER_API_KEY="sk-or-..."
   ```

   Get a key at <https://openrouter.ai/settings/keys>. Never commit `.env` — it's gitignored.

3. **Run the development server:**

   ```bash
   npm run dev
   ```

   Open [http://localhost:3000](http://localhost:3000) in your browser. The page auto-updates as you edit files under `app/`.

## Other Commands

- `npm run build` — Build for production
- `npm start` — Serve the production build (run `npm run build` first)
- `npm run lint` — Run ESLint

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font).

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
