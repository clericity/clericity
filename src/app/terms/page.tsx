'use client'

import Link from 'next/link'
import Image from 'next/image'
import { useLanguage } from '@/hooks/useLanguage'
import LanguageSwitcher from '@/components/LanguageSwitcher'

export default function TermsPage() {
  const { lang, setLang, t } = useLanguage()

  const EMAIL = 'kusalarudika@gmail.com'
  const emailLink = <a href={`mailto:${EMAIL}`} style={{ color: '#2563eb' }}>{EMAIL}</a>

  const meta = {
    hu: { title: 'Felhasználási Feltételek', updated: 'Utolsó frissítés: 2026. június 1.', back: '← Vissza a főoldalra' },
    en: { title: 'Terms of Service', updated: 'Last updated: June 1, 2026', back: '← Back to homepage' },
    sk: { title: 'Podmienky používania', updated: 'Posledná aktualizácia: 1. júna 2026', back: '← Späť na hlavnú stránku' },
  }[lang]

  const sections = lang === 'en' ? enSections(emailLink)
    : lang === 'sk' ? skSections(emailLink)
    : huSections(emailLink)

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f8fafc', fontFamily: "'Segoe UI', sans-serif" }}>
      <nav style={{ backgroundColor: '#0f172a', padding: '1rem 2rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Link href="/">
          <Image src="/clericity-logo.png" alt="CLERICITY" width={90} height={32} style={{ objectFit: 'contain' }} />
        </Link>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <LanguageSwitcher lang={lang} setLang={setLang} dark />
          <Link href="/" style={{ color: '#94a3b8', fontSize: '0.875rem', textDecoration: 'none' }}>{meta.back}</Link>
        </div>
      </nav>

      <div style={{ maxWidth: '780px', margin: '0 auto', padding: '3rem 2rem 5rem' }}>
        <h1 style={{ fontSize: '2rem', fontWeight: '800', color: '#0f172a', marginBottom: '0.5rem' }}>{meta.title}</h1>
        <p style={{ color: '#64748b', fontSize: '0.9rem', marginBottom: '3rem' }}>{meta.updated}</p>

        {sections.map((s, i) => (
          <Section key={i} title={s.title}>{s.content}</Section>
        ))}
      </div>

      <footer style={{ backgroundColor: '#0f172a', padding: '2rem', textAlign: 'center' }}>
        <p style={{ color: '#475569', fontSize: '0.8rem', margin: 0 }}>
          © 2026 CLERICITY — <Link href="/privacy-policy" style={{ color: '#475569' }}>{t.footer.privacy}</Link> · <Link href="/terms" style={{ color: '#475569' }}>{t.footer.terms}</Link>
        </p>
      </footer>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: '2.5rem' }}>
      <h2 style={{ fontSize: '1.125rem', fontWeight: '700', color: '#0f172a', marginBottom: '1rem', paddingBottom: '0.5rem', borderBottom: '2px solid #e2e8f0' }}>{title}</h2>
      <div style={{ color: '#374151', fontSize: '0.95rem', lineHeight: 1.8 }}>{children}</div>
    </div>
  )
}

function huSections(emailLink: React.ReactNode) {
  return [
    {
      title: '1. A szolgáltatásról',
      content: <>
        <p>A <strong>CLERICITY</strong> egy online foglalási rendszer, amely lehetővé teszi vállalkozások számára, hogy saját foglalási oldalt hozzanak létre, és ügyfeleiket online időpontfoglalásra invitálják.</p>
        <p>A platform igénybevételével Ön elfogadja az alábbi feltételeket. Ha nem ért egyet, kérjük, ne használja a szolgáltatást.</p>
      </>
    },
    {
      title: '2. Fiók létrehozása',
      content: <>
        <p>A CLERICITY használatához regisztráció szükséges. Ön felelős:</p>
        <ul>
          <li>a fiókjához tartozó jelszó biztonságáért</li>
          <li>a fiókon keresztül végzett minden tevékenységért</li>
          <li>az általa a rendszerbe bevitt adatok pontosságáért és jogszerűségéért</li>
        </ul>
        <p>Fiókját nem adhatja át harmadik félnek. Jogosulatlan hozzáférés esetén haladéktalanul értesítse a Velorát.</p>
      </>
    },
    {
      title: '3. Csomagok és díjszabás',
      content: <>
        <p>A CLERICITY ingyenes és fizetős csomagokat kínál:</p>
        <ul>
          <li><strong>Ingyenes</strong> — havi 100 foglalásig, 1 felhasználó</li>
          <li><strong>Alap (10€/hó)</strong> — havi 300 foglalásig, 2 felhasználó</li>
          <li><strong>Pro (16€/hó)</strong> — havi 1000 foglalásig, 5 felhasználó</li>
          <li><strong>Business (25€/hó)</strong> — havi 5000 foglalásig, 10 felhasználó</li>
        </ul>
        <p>Az árak euróban értendők és az ÁFÁ-t nem tartalmazzák. A díjak változhatnak; változás esetén legalább 30 nappal előre értesítjük az előfizetőket.</p>
      </>
    },
    {
      title: '4. Tiltott tevékenységek',
      content: <>
        <p>A CLERICITY platform igénybevételekor tilos:</p>
        <ul>
          <li>hamis vagy félrevezető adatok megadása</li>
          <li>a rendszer automatizált eszközökkel való terhelése (scraping, bot-ok)</li>
          <li>más felhasználók adatainak jogosulatlan elérése</li>
          <li>a platform jogellenes célokra való felhasználása</li>
          <li>spam vagy kéretlen kommunikáció küldése a rendszeren keresztül</li>
        </ul>
        <p>A fenti feltételek megszegése esetén fenntartjuk a jogot a fiók azonnali felfüggesztésére vagy törlésére.</p>
      </>
    },
    {
      title: '5. Szolgáltatás elérhetősége',
      content: <>
        <p>Törekszünk a folyamatos rendelkezésre állásra, de nem garantálunk 100%-os üzemidőt. Karbantartásokról és tervezett leállásokról előzetesen értesítjük a felhasználókat.</p>
        <p>Vis maior esetén (természeti katasztrófa, infrastrukturális meghibásodás) a CLERICITY nem vállal felelősséget a kiesett szolgáltatásért.</p>
      </>
    },
    {
      title: '6. Szellemi tulajdon',
      content: <>
        <p>A CLERICITY platform, annak dizájnja, kódja és arculata szerzői jogi védelem alatt áll. A felhasználók nem másolhatják, terjeszthetik vagy módosíthatják ezeket engedély nélkül.</p>
        <p>Az Ön által a rendszerbe töltött tartalmak (logó, fotók, szövegek) az Ön tulajdonát képezik. A CLERICITY kizárólag a szolgáltatás nyújtásához szükséges mértékben használja fel azokat.</p>
      </>
    },
    {
      title: '7. Felelősségkorlátozás',
      content: <>
        <p>A CLERICITY nem vállal felelősséget:</p>
        <ul>
          <li>elmaradt bevételért vagy közvetett károkért</li>
          <li>harmadik fél szolgáltatások (Google, Resend, Supabase) meghibásodásából eredő károkért</li>
          <li>a felhasználó által bevitt hibás adatokból adódó következményekért</li>
        </ul>
        <p>Felelősségünk minden esetben a kifizetett előfizetési díj összegére korlátozódik.</p>
      </>
    },
    {
      title: '8. Felmondás',
      content: <>
        <p>A szolgáltatást bármikor, indoklás nélkül felmondhatja a fiók törlésével (Beállítások → Profilom → Fiók törlése). Törléskor minden adata véglegesen eltávolításra kerül.</p>
        <p>A CLERICITY is felmondhatja a szerződést, ha a felhasználó megsérti a jelen feltételeket.</p>
      </>
    },
    {
      title: '9. Irányadó jog',
      content: <>
        <p>Jelen feltételekre a <strong>magyar jog</strong> az irányadó. Jogvita esetén a felek elsősorban tárgyalásos úton törekednek a megegyezésre. Ennek sikertelensége esetén a hatáskörrel és illetékességgel rendelkező magyar bíróság jár el.</p>
      </>
    },
    {
      title: '10. Kapcsolat',
      content: <>
        <p>Kérdés esetén írjon nekünk: {emailLink}</p>
      </>
    },
  ]
}

function enSections(emailLink: React.ReactNode) {
  return [
    {
      title: '1. About the Service',
      content: <>
        <p><strong>CLERICITY</strong> is an online booking system that enables businesses to create their own booking page and invite clients to schedule appointments online.</p>
        <p>By using the platform, you agree to the following terms. If you do not agree, please do not use the service.</p>
      </>
    },
    {
      title: '2. Account Creation',
      content: <>
        <p>Registration is required to use CLERICITY. You are responsible for:</p>
        <ul>
          <li>the security of your account password</li>
          <li>all activities carried out through your account</li>
          <li>the accuracy and legality of data you enter into the system</li>
        </ul>
        <p>You may not transfer your account to a third party. In case of unauthorized access, notify CLERICITY immediately.</p>
      </>
    },
    {
      title: '3. Plans and Pricing',
      content: <>
        <p>CLERICITY offers free and paid plans:</p>
        <ul>
          <li><strong>Free</strong> — up to 100 bookings/month, 1 user</li>
          <li><strong>Basic (€10/mo)</strong> — up to 300 bookings/month, 2 users</li>
          <li><strong>Pro (€16/mo)</strong> — up to 1,000 bookings/month, 5 users</li>
          <li><strong>Business (€25/mo)</strong> — up to 5,000 bookings/month, 10 users</li>
        </ul>
        <p>Prices are in euros and exclude VAT. Prices may change; subscribers will be notified at least 30 days in advance.</p>
      </>
    },
    {
      title: '4. Prohibited Activities',
      content: <>
        <p>When using the CLERICITY platform, the following are prohibited:</p>
        <ul>
          <li>providing false or misleading information</li>
          <li>loading the system with automated tools (scraping, bots)</li>
          <li>unauthorized access to other users&apos; data</li>
          <li>using the platform for illegal purposes</li>
          <li>sending spam or unsolicited communications through the system</li>
        </ul>
        <p>Violation of these terms may result in immediate account suspension or deletion.</p>
      </>
    },
    {
      title: '5. Service Availability',
      content: <>
        <p>We strive for continuous availability but do not guarantee 100% uptime. Users will be notified in advance of planned maintenance and outages.</p>
        <p>In cases of force majeure (natural disaster, infrastructure failure), CLERICITY is not liable for interrupted service.</p>
      </>
    },
    {
      title: '6. Intellectual Property',
      content: <>
        <p>The CLERICITY platform, its design, code, and branding are protected by copyright. Users may not copy, distribute, or modify these without permission.</p>
        <p>Content you upload (logo, photos, texts) remains your property. CLERICITY uses it solely to the extent necessary to provide the service.</p>
      </>
    },
    {
      title: '7. Limitation of Liability',
      content: <>
        <p>CLERICITY is not liable for:</p>
        <ul>
          <li>lost revenue or indirect damages</li>
          <li>damages resulting from third-party service failures (Google, Resend, Supabase)</li>
          <li>consequences arising from incorrect data entered by the user</li>
        </ul>
        <p>Our liability is in all cases limited to the amount of subscription fees paid.</p>
      </>
    },
    {
      title: '8. Termination',
      content: <>
        <p>You may terminate the service at any time without reason by deleting your account (Settings → My Profile → Delete Account). All your data will be permanently removed upon deletion.</p>
        <p>CLERICITY may also terminate the agreement if the user violates these terms.</p>
      </>
    },
    {
      title: '9. Governing Law',
      content: <>
        <p>These terms are governed by <strong>Hungarian law</strong>. In case of a dispute, the parties shall first seek to resolve it through negotiation. If unsuccessful, the competent Hungarian court shall have jurisdiction.</p>
      </>
    },
    {
      title: '10. Contact',
      content: <>
        <p>For questions, write to us: {emailLink}</p>
      </>
    },
  ]
}

function skSections(emailLink: React.ReactNode) {
  return [
    {
      title: '1. O službe',
      content: <>
        <p><strong>CLERICITY</strong> je online rezervačný systém, ktorý umožňuje firmám vytvoriť vlastnú rezervačnú stránku a pozývať klientov na online rezerváciu termínov.</p>
        <p>Používaním platformy súhlasíte s nasledujúcimi podmienkami. Ak nesúhlasíte, prosím, nepoužívajte službu.</p>
      </>
    },
    {
      title: '2. Vytvorenie účtu',
      content: <>
        <p>Na používanie CLERICITY je potrebná registrácia. Zodpovedáte za:</p>
        <ul>
          <li>bezpečnosť hesla k vášmu účtu</li>
          <li>všetky aktivity vykonané prostredníctvom vášho účtu</li>
          <li>presnosť a zákonnosť údajov, ktoré zadávate do systému</li>
        </ul>
        <p>Účet nesmie byť odovzdaný tretím stranám. V prípade neoprávneného prístupu nás okamžite informujte.</p>
      </>
    },
    {
      title: '3. Plány a cenník',
      content: <>
        <p>CLERICITY ponúka bezplatné a platené plány:</p>
        <ul>
          <li><strong>Zadarmo</strong> — do 100 rezervácií/mes., 1 používateľ</li>
          <li><strong>Základný (10€/mes.)</strong> — do 300 rezervácií/mes., 2 používatelia</li>
          <li><strong>Pro (16€/mes.)</strong> — do 1 000 rezervácií/mes., 5 používateľov</li>
          <li><strong>Business (25€/mes.)</strong> — do 5 000 rezervácií/mes., 10 používateľov</li>
        </ul>
        <p>Ceny sú v eurách a nezahŕňajú DPH. Ceny sa môžu zmeniť; predplatiteľov budeme informovať aspoň 30 dní vopred.</p>
      </>
    },
    {
      title: '4. Zakázané činnosti',
      content: <>
        <p>Pri používaní platformy CLERICITY je zakázané:</p>
        <ul>
          <li>uvádzanie nepravdivých alebo zavádzajúcich informácií</li>
          <li>zaťažovanie systému automatizovanými nástrojmi (scraping, boty)</li>
          <li>neoprávnený prístup k údajom iných používateľov</li>
          <li>používanie platformy na nezákonné účely</li>
          <li>zasielanie spamu alebo nevyžiadanej komunikácie prostredníctvom systému</li>
        </ul>
        <p>Porušenie podmienok môže mať za následok okamžité pozastavenie alebo zrušenie účtu.</p>
      </>
    },
    {
      title: '5. Dostupnosť služby',
      content: <>
        <p>Snažíme sa o nepretržitú dostupnosť, ale nezaručujeme 100% dostupnosť. Používatelia budú vopred informovaní o plánovaných výpadkoch údržby.</p>
        <p>V prípade vis maior (prírodná katastrofa, výpadok infraštruktúry) CLERICITY nezodpovedá za prerušenie služby.</p>
      </>
    },
    {
      title: '6. Duševné vlastníctvo',
      content: <>
        <p>Platforma CLERICITY, jej dizajn, kód a vizuálna identita sú chránené autorským právom. Používatelia ich nesmú kopírovať, šíriť ani upravovať bez povolenia.</p>
        <p>Obsah, ktorý nahráte (logo, fotografie, texty), zostáva vaším vlastníctvom. CLERICITY ho používa výlučne v rozsahu potrebnom na poskytovanie služby.</p>
      </>
    },
    {
      title: '7. Obmedzenie zodpovednosti',
      content: <>
        <p>CLERICITY nezodpovedá za:</p>
        <ul>
          <li>ušlý zisk alebo nepriame škody</li>
          <li>škody vyplývajúce z porúch služieb tretích strán (Google, Resend, Supabase)</li>
          <li>následky plynúce z nesprávnych údajov zadaných používateľom</li>
        </ul>
        <p>Naša zodpovednosť je vo všetkých prípadoch obmedzená na výšku zaplatených predplatiteľských poplatkov.</p>
      </>
    },
    {
      title: '8. Ukončenie',
      content: <>
        <p>Službu môžete kedykoľvek bez udania dôvodu ukončiť zrušením účtu (Nastavenia → Môj profil → Zrušiť účet). Pri zrušení budú všetky vaše údaje trvalo odstránené.</p>
        <p>CLERICITY môže tiež ukončiť zmluvu, ak používateľ poruší tieto podmienky.</p>
      </>
    },
    {
      title: '9. Rozhodné právo',
      content: <>
        <p>Na tieto podmienky sa vzťahuje <strong>maďarské právo</strong>. V prípade sporu sa strany najprv pokúsia o vyriešenie rokovaním. V prípade neúspechu je príslušný maďarský súd.</p>
      </>
    },
    {
      title: '10. Kontakt',
      content: <>
        <p>V prípade otázok nám napíšte: {emailLink}</p>
      </>
    },
  ]
}
