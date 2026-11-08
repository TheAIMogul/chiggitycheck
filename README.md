# ChiggityCheck

Snap the paper sign-in sheet. ChiggityCheck reads it, matches every handwritten name to the right kid, tells program staff which families to call this week (with the message already written in the family's language), and keeps the funder's quarterly report finished. Every number in the report opens the photo it came from.

Built for the Give Miami Day Hackathon 2026 (The Miami Foundation), challenge #1 "From sign-up to quarterly report", for a fictional Miami nonprofit, Tidepath Family Alliance.

**Live:** https://chiggitycheck.micahberkley.com

> Work in progress during the hackathon. Full README with screenshots, architecture and the demo script lands before the deadline.

## Stack
- Cloudflare Workers (API + static assets), D1 (SQLite), R2 (photos), Workers AI (vision)
- OpenAI Decisions API (`gpt-6-luna`) for name matching and follow-up scoring, `gpt-5.5` for drafting messages
- React 19 + Vite 8 + TypeScript

## Run locally
```bash
npm install
cp .dev.vars.example .dev.vars   # add your OpenAI key
npx wrangler d1 migrations apply chiggitycheck --local
npm run dev
```

## License
MIT. Data in this repo is fictional.
