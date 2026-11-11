# Intake Copy — to be confirmed by the owner

Everything a customer reads in the chat intake (and the prefilled messages the operator sends) is listed here. **Nothing in this file may be invented by a developer or an AI.** Until the owner fills an item, its text stays empty in `src/config/intake-flow.ts` and the related button or message is hidden.

How to fill it: write the wording in the "Owner's text" column (or send it by message/email) and a developer copies it into the config. Mark each item with the date it was confirmed.

Status key: ⬜ not provided · ✅ confirmed

## Contact numbers (confirmed)

| Item | Value | Status |
|---|---|---|
| Call button | (027) 770 - 0486 | ✅ 2026-11-11 |
| WhatsApp button | 021 266 5208 (`+64 21 266 5208`) | ✅ 2026-11-11 |
| SMS button | 021 266 5208 (for now) | ✅ 2026-11-11 |
| New-request email goes to | info@afterhoursworkshop.co.nz | ✅ 2026-11-11 |

## 1. General chat text

| Item | Where it appears | Owner's text | Status |
|---|---|---|---|
| Intro line | Top of the chat, before step 1 | | ⬜ |
| Privacy note | Step 2 (contact): answers are saved as you go and used only to contact you | | ⬜ |
| Finish message | After the last step. Must not mention price, diagnosis or a confirmed booking | | ⬜ |
| "I'm not sure" label | Every step | | ⬜ |
| Contact bar label | Sticky call/WhatsApp/SMS bar | | ⬜ |
| Link to the secondary form | Under the chat | | ⬜ |

## 2. Symptom categories (step 1)

One row per category button. "Keywords" are words in the customer's free-text line that pre-select this category (the customer still confirms).

| # | Button label | Keywords | Status |
|---|---|---|---|
| 1 | | | ⬜ |
| 2 | | | ⬜ |
| 3 | | | ⬜ |
| … | | | |

## 3. Symptom details (step 4)

For each category above: the follow-up buttons, and whether a button is a **danger symptom** (shows a safety warning).

| Category | Detail button label | Danger? (Y/N) | Status |
|---|---|---|---|
| | | | ⬜ |

## 4. Safety warnings and guidance

Shown when a danger symptom is chosen, or for a whole category. **Required**: a danger button stays hidden until its warning text is confirmed.

| Applies to | Warning / guidance text | Status |
|---|---|---|
| | | ⬜ |

## 5. Drivable question (step 5)

| Item | Owner's text | Status |
|---|---|---|
| Question | | ⬜ |
| Extra note when "No" is chosen (e.g. what to do if the car can't be moved) | | ⬜ |

## 6. Contact preferences (step 6)

| Item | Owner's text | Status |
|---|---|---|
| Question for the preferred method | | ⬜ |
| Time-window choices (e.g. which parts of the day/week the operator can call back) | | ⬜ |

## 7. Prefilled messages for the operator

The text inserted when the operator taps WhatsApp/SMS on an Inbox card. Placeholders in `{braces}` are filled automatically.

| Use | Owner's text | Status |
|---|---|---|
| First reply to a new request (can use `{name}`, `{vehicle}`) | | ⬜ |
| Booking confirmed (can use `{name}`, `{date}`, `{time}`) | | ⬜ |
