# Existing Site Content — Afterhours Workshop

Source: https://www.afterhoursworkshop.co.nz/
Captured: 2026-11-10 (Step 1: Inspect)

All quoted text is copied **verbatim** from the live site, including its original spelling, capitalisation and punctuation. Nothing in this file is invented. Anything we could not confirm on the site is listed in [Unverified / missing information](#unverified--missing-information).

---

## 1. Business identity

| Item | Value on site |
|---|---|
| Business name (as displayed) | **Afterhours Workshop** (one word, "Afterhours") |
| Location tagline | "@ St johns, Auckland" |
| Hero tagline | "Your one & only, local, After-hours workshop." |
| Platform | Squarespace |
| Logo | Text only ("Afterhours Workshop"). No image logo was found. |
| Meta description | Empty on every page |

> Note: the project spec writes the name as "After Hours Workshop" (two words), but the live site uses "Afterhours Workshop". Confirm which spelling to use.

## 2. Page structure

| Page | URL | Browser title | Main sections |
|---|---|---|---|
| Home | `/` | Afterhours Workshop | Hero, intro and hours, Our Services (3 cards), Schedule today, footer |
| About | `/about` | About — Afterhours Workshop | Who we are, Contact us (form), footer |
| Services | `/services` | Services — Afterhours Workshop | Our Services (3 cards with "Book Now"), Contact us (form), footer |
| Appointments | `/appointments` | Bookings — Afterhours Workshop | Schedule today (no booking form yet), footer |

- Navigation: Home · About · Services · Appointments
- A cart icon showing "0" appears in the header (`/cart`). This is a Squarespace default and the site doesn't appear to sell anything.
- There is no separate Contact page. Contact forms appear on About and Services, and contact details are in the footer of every page.

## 3. Contact details (footer on every page)

| Item | Value |
|---|---|
| Address | 80 Morrin Road, St Johns, Auckland 1072 |
| Email | info@afterhoursworkshop.co.nz |
| Phone | (027) 770 - 0486 |
| Social media | None found |
| Map embed | Google map of St Johns in the footer of every page (seen in `docs/design-reference/`) |

**Contact form** (About and Services pages, from the screenshots): Name, split into First Name *(required)* and Last Name *(required)*; Email *(required)*; a "Sign up for news and updates" checkbox; Message *(required)*; and a "Submit" button.

## 4. Opening hours

From the Home page only:

> "Open from **5 PM to 10 PM** on weekdays and **all** day on weekends."

- Weekdays (Mon–Fri): 5:00 PM – 10:00 PM
- Weekends (Sat–Sun): "all day". The site gives no exact times.

## 5. Services

The Home and Services pages show the same three packages. Prices are shown as on the site, with no currency or GST note.

### Basic Service — From $99
> "Basic check-ups of your car.
> Including Engine oil + filter replacement."

### Advanced Service — From $149
(Shown on the site as "advanced Service".)
> "So-called 'Full services'. Overall inspections of car and additional services."

### Track-ready Service — $199
(Shown on the site as "Track-ready service". This price is fixed, not "From".)
> "Our best service package for car enthausiasts' track-ready service.
> Brake pad replacement, brake bleeding, spanner check for all key areas!"

> Typo on the site: "enthausiasts'" should be "enthusiasts'". Fix it in the new copy.

## 6. Page copy (verbatim)

### Home
**Hero**
> Your
> one & only, local,
> After-hours workshop.
>
> @ St johns, Auckland

**Intro**
> Welcome to Afterhours Workshop, your top spot for car services.
>
> Open from 5 PM to 10 PM on weekdays
> and all day on weekends.
>
> From general maintenance & repair, to upgrade your car, we provide top quality service by qualified professional mechanic.

Button: "Learn more" (links to `/about`)

**Our Services:** the three cards in section 5.

**Schedule today**
> Online Booking will be soon to be available in later July 2025.
>
> Book your slot for car services, if you are not sure what to choose, give us a call or email us!

### About
**Who we are**
> All my mates always wanted to have an afterhours serviced workshop,
> so that we all can save another day off!
>
> And here we are to provide workshop services outside of 'ordinary' business hours.
>
> Not only our business hour is extraordinary, so is our service.
>
> From car maintenance, repair, to fancy upgrade, we are confident to offer best services while keeping the price tag reasonable and competitive in this tough industry.
>
> [Specialised areas]
>
> [Mechanic's info]

> The last two lines are **unfilled placeholders** on the live site.

**Contact us**
> You've got any questions? Any consult, help, or additional information needed but don't want to talk over a phone?
>
> Fill out some info and we will be in touch shortly.
>
> We can't wait to have a chat with you!

### Services
**Our Services:** the three cards in section 5, plus a "Book Now" button that links to Appointments.

**Contact us**
> Interested in working together? Fill out some info and we will be in touch shortly. We can't wait to hear from you!

### Appointments (title: "Bookings")
**Schedule today**
> Make a booking to secure your slot for car service!
>
> Track-ready package booking is especially required as it will be quickly booked out before track days.
>
> Not sure which one to select? Please give us a call to consult :)
>
> Online Booking will be available in later July 2025!
>
> Please watch the space… 👀

> The page has no booking form. The July 2025 date has already passed, so this text is out of date.

## 7. Images

All images are **Unsplash stock photos** hosted on the Squarespace CDN. Most have no alt text.

| Page | Image files |
|---|---|
| Home | `unsplash-image-c7VByynfcvg.jpg`, `unsplash-image-iFQpqbLMOFU.jpg`, `unsplash-image-3AvQJActhbw.jpg`, `unsplash-image-UZUzvJEvKnI.jpg`, `unsplash-image-BFdHyMPojEA.jpg` |
| About | `unsplash-image-UZUzvJEvKnI.jpg` |
| Services | `unsplash-image-iFQpqbLMOFU.jpg`, `unsplash-image-3AvQJActhbw.jpg`, `unsplash-image-UZUzvJEvKnI.jpg` |
| Appointments | `unsplash-image-BFdHyMPojEA.jpg` |

The site has no photos of the actual workshop, team or vehicles.

## 8. Content to carry over into the rebuild

- The origin story ("All my mates… save another day off!") fits the after-hours value proposition and is worth keeping in tidied-up form.
- The three service packages, with their prices kept exactly as shown.
- Opening hours, address, email and phone.
- The note that Track-ready slots book out before track days. This supports the motorsport/performance angle (spec section 4, About).

---

## Unverified / missing information

None of these were found on the site. **Do not invent them.** Make them configurable or ask the owner.

1. **Name spelling:** "Afterhours Workshop" on the site vs "After Hours Workshop" in the spec.
2. **Weekend hours:** the site says only "all day", with no start or end time.
3. **Public holiday hours:** not stated.
4. **What "Advanced Service" includes:** the site says only "Overall inspections of car and additional services".
5. **Basic Service checklist:** the site lists only engine oil and filter, plus unspecified "basic check-ups".
6. **Price terms:** GST inclusion, which vehicle types or sizes "From" covers, and whether parts are included.
7. **Specialised areas:** a placeholder on the About page.
8. **Mechanic information:** names, qualifications and years of experience. This is a placeholder on the About page. "qualified professional mechanic" is the only claim made.
9. **Motorsport/performance background:** implied by the "Track-ready" package only. The site makes no explicit claim.
10. **Other services:** "repair" and "upgrade" are mentioned, but no specific repair or upgrade services are listed.
11. **Business details:** legal entity name, NZBN, and any certifications (e.g. MTA) are not shown.
12. **Social media and Google Business profile:** none linked.
13. **Logo and brand assets:** text logo only. No brand colours or logo file found.
14. **Real photos:** all images are stock.
15. **Newsletter:** the contact form has a "Sign up for news and updates" checkbox, but there's no sign of a newsletter actually being sent. The spec says no automatic marketing messages.
16. **Payment methods, cancellation policy, warranty and courtesy car:** not mentioned.
17. **Booking lead time and slot length:** not stated.
