# Clericity - Online Foglalási Rendszer
## Projekt Dokumentáció

---

## 1. Projekt Áttekintés

**Clericity** egy multi-tenant SaaS online foglalási rendszer (Calendly/Bookio alternatíva), amely Google Calendar kétirányú szinkronizációval működik.

- **Tech stack:** Next.js 16, Supabase, Resend, Google Calendar API
- **Deployment:** Vercel (tervezett)
- **Mobil:** React Native/Expo (tervezett, ugyanarra a Supabase backendre)
- **Projekt mappa:** `C:\Users\kusal\Desktop\online rendszer\foglalasi-rendszer`

---

## 2. Architektúra

### Multi-tenant modell
- Minden bérlő (`tenant`) saját fiókkal rendelkezik
- Minden adat `tenant_id`-hoz kötött
- Super admin (Rudolf) mindent lát és módosíthat
- Slug-alapú publikus URL: `domain.hu/kovacs-barbershop`

### Tech döntések
- Google Calendar kétirányú szinkron → natív naptár helyett
- Nincs online fizetés (Stripe később)
- Supabase RLS minden táblán
- Párhuzamos API lekérések (`Promise.all`)

---

## 3. Fájlstruktúra

```
foglalasi-rendszer/
├── src/
│   ├── app/
│   │   ├── [slug]/
│   │   │   └── page.tsx              → publikus foglalási oldal
│   │   ├── api/
│   │   │   ├── register/
│   │   │   │   └── route.ts          → regisztráció API
│   │   │   ├── google/
│   │   │   │   ├── auth/route.ts     → Google OAuth indítás
│   │   │   │   ├── callback/route.ts → Google OAuth callback
│   │   │   │   ├── slots/route.ts    → szabad időpontok API
│   │   │   │   └── available-days/route.ts → elérhető napok API
│   │   │   ├── bookings/
│   │   │   │   ├── create/route.ts   → foglalás létrehozása
│   │   │   │   ├── cancel/route.ts   → foglalás lemondása
│   │   │   │   └── cancel-info/route.ts → lemondási info
│   │   │   └── email/
│   │   │       └── send/route.ts     → email küldés (Resend)
│   │   ├── cancel/
│   │   │   └── [token]/page.tsx      → lemondási oldal
│   │   ├── dashboard/
│   │   │   ├── layout.tsx            → dashboard sidebar layout
│   │   │   ├── page.tsx              → főoldal
│   │   │   ├── settings/page.tsx     → beállítások
│   │   │   ├── staff/page.tsx        → munkatársak
│   │   │   ├── services/page.tsx     → szolgáltatások
│   │   │   ├── hours/page.tsx        → nyitvatartás + szabadnapok
│   │   │   ├── bookings/
│   │   │   │   ├── page.tsx          → foglalások lista
│   │   │   │   └── settings/page.tsx → foglalási mezők
│   │   │   ├── qrcode/page.tsx       → QR kód generátor
│   │   │   └── email/page.tsx        → email beállítások
│   │   └── page.tsx                  → landing page
│   └── lib/
│       ├── supabase.ts               → kliens oldali Supabase
│       ├── supabaseServer.ts         → szerver oldali admin Supabase
│       └── TenantContext.tsx         → globális tenant/profile context
├── public/
│   └── clericity-logo.png
├── .env.local
├── next.config.ts
└── tsconfig.json
```

---

## 4. Environment Variables (.env.local)

```env
NEXT_PUBLIC_SUPABASE_URL=https://smheyvllxkhjfrapuufb.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIs...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIs...
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
RESEND_API_KEY=re_...
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

---

## 5. Supabase Adatbázis

**Projekt URL:** https://smheyvllxkhjfrapuufb.supabase.co

### Táblák

#### `tenants` – üzletek
| Mező | Típus | Leírás |
|------|-------|--------|
| id | UUID | Primary key |
| name | TEXT | Üzlet neve |
| slug | TEXT | Foglalási URL (pl. kovacs-barbershop) |
| description | TEXT | Leírás |
| logo_url | TEXT | Logo URL (Supabase Storage) |
| email | TEXT | Email cím |
| phone | TEXT | Telefonszám |
| country | TEXT | Ország kód (pl. HU) |
| timezone | TEXT | Időzóna (pl. Europe/Budapest) |
| custom_domain | TEXT | Egyedi domain (csak super admin) |
| booking_horizon | INTEGER | Hány napra előre lehet foglalni (default: 30) |
| google_calendar_id | TEXT | Google Calendar ID |
| google_refresh_token | TEXT | Google OAuth refresh token |
| email_subject | TEXT | Email tárgy sablon |
| email_body | TEXT | Email szöveg sablon |
| email_from_name | TEXT | Feladó neve |

#### `profiles` – felhasználók
| Mező | Típus | Leírás |
|------|-------|--------|
| id | UUID | → auth.users |
| tenant_id | UUID | → tenants |
| full_name | TEXT | Teljes név |
| role | TEXT | super_admin / tenant_admin |
| phone | TEXT | Telefonszám |

#### `staff` – munkatársak
| Mező | Típus | Leírás |
|------|-------|--------|
| id | UUID | Primary key |
| tenant_id | UUID | → tenants |
| name | TEXT | Név |
| email | TEXT | Email |
| phone | TEXT | Telefon |
| google_calendar_id | TEXT | Gmail cím |
| google_refresh_token | TEXT | Google OAuth token |

#### `services` – szolgáltatások
| Mező | Típus | Leírás |
|------|-------|--------|
| id | UUID | Primary key |
| tenant_id | UUID | → tenants |
| name | TEXT | Szolgáltatás neve |
| duration_minutes | INTEGER | Időtartam percben |
| price | INTEGER | Ár |
| currency | TEXT | HUF / EUR |
| description | TEXT | Leírás |
| slot_interval | INTEGER | Időköz percben (0 = auto) |

#### `opening_hours` – nyitvatartás
| Mező | Típus | Leírás |
|------|-------|--------|
| id | UUID | Primary key |
| tenant_id | UUID | → tenants |
| day_of_week | INTEGER | 0=Vasárnap, 1=Hétfő... |
| open_time | TIME | Nyitás |
| close_time | TIME | Zárás |
| is_closed | BOOLEAN | Zárva van-e |
| break_start | TIME | Szünet kezdete |
| break_end | TIME | Szünet vége |

#### `holidays` – szabadnapok
| Mező | Típus | Leírás |
|------|-------|--------|
| id | UUID | Primary key |
| tenant_id | UUID | → tenants |
| date | DATE | Dátum |
| label | TEXT | Megnevezés |
| start_time | TIME | Részleges szabadnap kezdete |
| end_time | TIME | Részleges szabadnap vége |

#### `bookings` – foglalások
| Mező | Típus | Leírás |
|------|-------|--------|
| id | UUID | Primary key |
| tenant_id | UUID | → tenants |
| staff_id | UUID | → staff |
| service_id | UUID | → services |
| google_event_id | TEXT | Google Calendar esemény ID |
| customer_first_name | TEXT | Vendég keresztnév |
| customer_last_name | TEXT | Vendég vezetéknév |
| customer_email | TEXT | Vendég email |
| customer_phone | TEXT | Vendég telefon |
| start_time | TIMESTAMPTZ | Kezdés |
| end_time | TIMESTAMPTZ | Befejezés |
| status | TEXT | confirmed / cancelled |
| cancel_token | UUID | Lemondási token |

#### `booking_fields` – foglalási mezők
| Mező | Típus | Leírás |
|------|-------|--------|
| id | UUID | Primary key |
| tenant_id | UUID | → tenants |
| field_type | TEXT | first_name/last_name/email/phone/custom |
| label | TEXT | Mező neve |
| required | BOOLEAN | Kötelező-e |
| enabled | BOOLEAN | Aktív-e |
| order_index | INTEGER | Sorrend |
| service_ids | UUID[] | Melyik szolgáltatásnál jelenik meg |

#### `email_automations` – email automatizációk
| Mező | Típus | Leírás |
|------|-------|--------|
| id | UUID | Primary key |
| tenant_id | UUID | → tenants |
| name | TEXT | Automatizáció neve |
| trigger_type | TEXT | booking_confirmed/before_appointment/after_appointment |
| trigger_delay_minutes | INTEGER | Késés percben |
| subject | TEXT | Email tárgy |
| body | TEXT | Email szöveg |
| enabled | BOOLEAN | Aktív-e |

### Indexek
```sql
CREATE INDEX idx_bookings_tenant_time ON bookings (tenant_id, start_time);
CREATE INDEX idx_bookings_staff_time ON bookings (staff_id, start_time);
CREATE INDEX idx_services_tenant ON services (tenant_id);
CREATE INDEX idx_staff_tenant ON staff (tenant_id);
CREATE INDEX idx_opening_hours_tenant_day ON opening_hours (tenant_id, day_of_week);
CREATE INDEX idx_holidays_tenant_date ON holidays (tenant_id, date);
CREATE INDEX idx_booking_fields_tenant ON booking_fields (tenant_id);
CREATE INDEX idx_email_automations_tenant ON email_automations (tenant_id);
```

### Constraints
```sql
-- Dupla foglalás védelem
CREATE EXTENSION IF NOT EXISTS btree_gist;
ALTER TABLE bookings ADD CONSTRAINT no_overlap_per_staff
EXCLUDE USING gist (
  staff_id WITH =,
  tstzrange(start_time, end_time) WITH &&
) WHERE (status = 'confirmed');
```

### RLS Policies
Minden táblán engedélyezve. Fő elvek:
- Tenant adminok csak saját adataikat látják
- Publikus olvasás: tenants, services, opening_hours, booking_fields, holidays
- Vendégek INSERT-et tudnak csinálni: bookings, booking_fields (SELECT)

---

## 6. Google Calendar Integráció

### OAuth Flow
1. Admin kattint az "Összekötés" gombra a beállításokban
2. `/api/google/auth?tenantId=xxx` → Google OAuth oldal
3. Callback: `/api/google/callback?code=xxx&state=tenantId`
4. Token mentése a `staff` táblába

### Szabad időpontok logikája (`/api/google/slots`)
1. Holiday ellenőrzés (egész napos → visszautasítás)
2. Nyitvatartás lekérése az adott napra
3. Google Calendar események lekérése (UTC → lokális idő konverzió)
4. Slot generálás: nyitástól zárásig, `slot_interval` vagy `duration_minutes` lépésekben
5. Kizárások: múlt időpontok, Google Calendar ütközések, részleges holiday, szünet

### Elérhető napok (`/api/google/available-days`)
- Egész hónapra előre kiszámolja melyik napokon van legalább 1 szabad időpont
- `booking_horizon` alapján korlátozza a jövőbe tekintést
- Eredmény cache-elés ajánlott

---

## 7. Email Rendszer (Resend)

### Visszaigazoló email
- Foglalás után azonnal küldi
- Személyre szabható: feladó neve, tárgy, szöveg
- Változók: `{customerName}`, `{serviceName}`, `{date}`, `{slot}`, `{businessName}`
- Lemondási link: `/cancel/{cancel_token}`

### Email automatizációk (adatbázisban tárolva, küldés TODO)
- `booking_confirmed`: foglalás után X perccel
- `before_appointment`: időpont előtt X perccel/órával/nappal
- `after_appointment`: időpont után X perccel/órával/nappal

> ⚠️ Az automatizációk adatbázisban tárolva vannak, de a tényleges küldés még implementálandó (Supabase Edge Function + cron job szükséges)

---

## 8. Foglalási Folyamat (Publikus oldal)

### 3 lépéses folyamat:
1. **Szolgáltatás választás** – kártyás lista, ár és időtartam megjelenítéssel
2. **Időpont választás** – havi naptár nézettel, szabad időpontok betöltéssel
3. **Adatok megadása** – dinamikus mezők (`booking_fields` alapján)

### Naptár logika:
- Letiltott napok: múlt napok, zárt napok, egész napos holiday, nincs szabad időpont
- Betöltési jelző a napok fölött
- Hónap navigáció előre/hátra nyilakkal
- Booking horizon korlátozás

---

## 9. Dashboard Menüpontok

| Menüpont | Útvonal | Leírás |
|----------|---------|--------|
| 🏠 Főoldal | /dashboard | Üdvözlő oldal |
| ⚙️ Beállítások | /dashboard/settings | Logo, slug, Google Calendar |
| 👤 Munkatársak | /dashboard/staff | Hozzáadás, törlés |
| ✂️ Szolgáltatások | /dashboard/services | Szerkesztés, időköz, tömeges beállítás |
| 🕐 Nyitvatartás | /dashboard/hours | Heti nyitvatartás + szünet + szabadnapok + előre foglalás |
| 📅 Foglalások | /dashboard/bookings | Lista, szűrés, lemondás |
| 📱 QR Kód | /dashboard/qrcode | Generálás, letöltés, nyomtatás |
| 📧 Email beállítások | /dashboard/email | Sablon + automatizációk |

---

## 10. Fontos Döntések és Megjegyzések

### Biztonsági megjegyzések
- RLS ki volt kapcsolva fejlesztés alatt → most már be van kapcsolva
- `supabaseAdmin` (service role) csak server-side route-okban használható
- Publikus foglalási oldal `supabase` (anon) klienst használ

### Ismert limitációk
- Google OAuth callback mindig az első staff rekordhoz menti a tokent
- Email automatizációk küldése még nem implementált (cron job szükséges)
- Stripe integráció még nincs (tervezett)

### Super Admin
- User ID: `42b57964-0ab3-4f83-868b-ef0c4bfe6e51`
- Tenant ID: `8ed60e45-5119-459e-b6ca-a63a39dd9bbc`
- Role: `super_admin`

### Storage
- `logos` bucket – publikus, logo feltöltéshez
- next.config.ts: `smheyvllxkhjfrapuufb.supabase.co` engedélyezve

---

## 11. Tervezett Funkciók (TODO)

- [ ] Stripe fizetési integráció (előfizetés kezelés)
- [ ] Email automatizációk tényleges küldése (Edge Function + cron)
- [ ] Munkatárs saját Google Calendar összekötése
- [ ] Super admin panel (összes bérlő kezelése)
- [ ] React Native mobil app
- [ ] Redis cache az availability slot számításhoz
- [ ] Lemondás visszaigazoló email

---

## 12. Fejlesztési Parancsok

```bash
# Fejlesztői szerver indítása
npm run dev

# Port felszabadítása
npx kill-port 3000

# Csomagok telepítése
npm install @supabase/auth-helpers-nextjs
npm install qrcode && npm install --save-dev @types/qrcode
npm install resend
```

---

*Dokumentáció utolsó frissítése: 2026. május 31.*
