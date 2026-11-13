# Request Form Copy — to be confirmed by the owner

Everything a customer reads on the request form, the finish screen and the contact buttons, plus the message the operator receives, is listed here. **Nothing in this file may be invented by a developer or an AI.** Until the owner confirms an item, it shows the placeholder noted below (or is hidden).

How to fill it: write the wording in the "Owner's text" column (or send it by message/email) and a developer copies it into the config. Mark each item with the date it was confirmed.

Status key: ⬜ not provided · ✅ confirmed

Where it lives: request form and finish screen wording, problem buttons and time choices are in `src/config/intake.ts` (the site currently shows placeholder text for every ⬜ item there); contact numbers and handles are in `src/config/site.ts`.

## Contact buttons

| Button | Value | Status |
|---|---|---|
| Call | (027) 770 - 0486 | ✅ (existing site) |
| SMS | 021 266 5208 | ✅ 2026-11-11 |
| WhatsApp | 021 266 5208 (`+64 21 266 5208`) | ✅ 2026-11-11 |
| Email | info@afterhoursworkshop.co.nz | ✅ (existing site) |
| Facebook Messenger | Facebook page username (for `m.me/<username>`) | ⬜ hidden until provided |
| Instagram | afterhours_workshop_nz (`ig.me/m/afterhours_workshop_nz`) | ✅ 2026-11-13 |

## 1. Request form

| Item | Where it appears | Owner's text | Status |
|---|---|---|---|
| Page heading and intro line | Top of `/appointments` | | ⬜ |
| "I'm not sure" label for the registration | Registration field | | ⬜ |
| Optional note placeholder | Under the problem buttons | | ⬜ |
| Submit button label | Bottom of the form | | ⬜ |
| Privacy note | Under the submit button (what the details are used for) | | ⬜ |

## 1b. Request chat

| Item | Where it appears | Owner's text | Status |
|---|---|---|---|
| "Chat with us" button label | Corner button on every page, and the buttons in the "Contact us" sections | | ⬜ |
| Greeting line | First message in the chat | | ⬜ |
| Question for each step (problem, name and phone, registration, contact method, times) | Chat messages | | ⬜ |
| "I'm not sure" / "Skip" labels | Every step | | ⬜ |
| Privacy note | Name and phone step (answers are saved as you go) | | ⬜ |
| Quick-question buttons (Send a request / What’s in each service? / Opening hours / Where are you? / Phone & contact) | First message in the chat | | ⬜ |

Quick answers are built only from verified details: hours, address and numbers from `src/config/site.ts`, and service descriptions from the `services` table (as on the Services page). The chat never shows prices.

## 2. Problem / work buttons (form and chat)

One row per button. Candidates from the existing site (not yet confirmed as buttons): Basic Service, Advanced Service, Track-ready Service, repair, upgrade, and "Not sure". Plus "Question / something else" (replaces the old contact form; the chat then asks for the question).

| # | Button label | Status |
|---|---|---|
| 1 | | ⬜ |
| 2 | | ⬜ |
| 3 | | ⬜ |
| … | | |

## 3. Preferred times

| Item | Proposed | Status |
|---|---|---|
| Choices | Weekday evening / Weekend / Any time | ⬜ |

## 4. Finish screen

| Item | Proposed (from the brief) | Status |
|---|---|---|
| Message | "Your request has been received. A mechanic will check it and contact you directly." Must not mention price, diagnosis or a confirmed booking. | ⬜ |

## 5. Home page "How it works"

Replaces the old booking explanation (no "Online booking will be available in July 2025").

| Step | Owner's text | Status |
|---|---|---|
| 1 | | ⬜ |
| 2 | | ⬜ |
| 3 | | ⬜ |

Current placeholder (`howItWorks` in `src/config/intake.ts`): 1. Send a request, chat, or call us. 2. A mechanic checks it and contacts you. 3. We arrange a time with you. The "Book now" buttons, and the home hero button (was "Learn more"), now read "Send a request". "Why choose us" was removed (it repeated the hero).

## 5b. Search descriptions

Page titles and Google descriptions are in `src/config/seo.ts`, written only from verified details (address, hours, phone, service names). The owner can reword them.

| Item | Status |
|---|---|
| Home / Services / About / Contact / Request descriptions | ⬜ |
| Home "Schedule today" text, now "Not sure what you need? Send a request or give us a call." (`sitePrompts.schedule`; was "Book your slot for car services…") | ⬜ |
| "Contact us" band on About / Services, now "Questions? Call, message or chat with us. We’ll get back to you." (`sitePrompts.contact`; was "Fill out some info…", but there is no form there any more) | ⬜ |

## 6. Operator messages

| Use | Owner's text | Status |
|---|---|---|
| Prefilled WhatsApp reply in the Telegram alert (`wa.me` link; can use `{name}`, `{rego}`) | | ⬜ (link opens with no text until provided) |
