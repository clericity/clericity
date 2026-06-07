'use client'

import Link from 'next/link'
import Image from 'next/image'
import { useLanguage } from '@/hooks/useLanguage'
import LanguageSwitcher from '@/components/LanguageSwitcher'

export default function PrivacyPolicyPage() {
  const { lang, setLang, t } = useLanguage()

  const EMAIL = 'clericity.booking@gmail.com'
  const emailLink = <a href={`mailto:${EMAIL}`} style={{ color: '#2563eb' }}>{EMAIL}</a>

  const meta = {
    hu: { title: 'Adatvédelmi Tájékoztató', updated: 'Utolsó frissítés: 2026. június 1.', back: '← Vissza a főoldalra' },
    en: { title: 'Privacy Policy', updated: 'Last updated: June 1, 2026', back: '← Back to homepage' },
    sk: { title: 'Ochrana osobných údajov', updated: 'Posledná aktualizácia: 1. júna 2026', back: '← Späť na hlavnú stránku' },
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
      title: '1. Adatkezelő adatai',
      content: <>
        <p>Az adatkezelő a <strong>CLERICITY</strong> online foglalási platform üzemeltetője.</p>
        <p>Kapcsolat: {emailLink}</p>
      </>
    },
    {
      title: '2. Az adatkezelés célja és jogalapja',
      content: <>
        <p>A CLERICITY foglalási rendszer az alábbi célokból kezel személyes adatokat:</p>
        <ul>
          <li>Online foglalások lebonyolítása és visszaigazolása</li>
          <li>Foglalással kapcsolatos email értesítések küldése</li>
          <li>Üzleti fiók és munkatárs-profilok kezelése</li>
          <li>Naptárszinkronizáció (Google Calendar integráció)</li>
        </ul>
        <p>Az adatkezelés jogalapja: <strong>az érintett hozzájárulása</strong> (GDPR 6. cikk (1) a) pont), illetve <strong>szerződés teljesítése</strong> (GDPR 6. cikk (1) b) pont).</p>
      </>
    },
    {
      title: '3. Kezelt adatok köre',
      content: <>
        <p><strong>Foglalók (vendégek) esetén:</strong></p>
        <ul>
          <li>Vezetéknév és keresztnév</li>
          <li>Email cím</li>
          <li>Telefonszám</li>
          <li>Foglalás időpontja, szolgáltatás neve</li>
        </ul>
        <p><strong>Üzlettulajdonosok esetén:</strong></p>
        <ul>
          <li>Üzlet neve, leírása, logója</li>
          <li>Email cím, telefonszám</li>
          <li>Foglalási oldal egyedi azonosítója (slug)</li>
          <li>Google Calendar hozzáférési token (ha csatlakoztatva)</li>
        </ul>
        <p><strong>Munkatársak esetén:</strong></p>
        <ul>
          <li>Név, email cím, telefonszám</li>
          <li>Profilkép, kor, bemutatkozó szöveg</li>
          <li>Referencia munkafotók (max. 7 db)</li>
        </ul>
      </>
    },
    {
      title: '4. Adatmegőrzési idő',
      content: <>
        <p>A foglalásokhoz tartozó személyes adatokat a foglalás dátumától számított <strong>1 évig</strong> őrizzük meg, ezt követően töröljük.</p>
        <p>Üzleti fiókok adatait a fiók törléséig tároljuk. Fiók törlésekor minden kapcsolódó adat véglegesen törlésre kerül.</p>
      </>
    },
    {
      title: '5. Adattovábbítás, adatfeldolgozók',
      content: <>
        <p>Adatait az alábbi harmadik fél szolgáltatókkal osztjuk meg, kizárólag a szolgáltatás nyújtásához szükséges mértékben:</p>
        <ul>
          <li><strong>Supabase Inc.</strong> — adatbázis és tárhelyszolgáltatás (USA, megfelelő garanciák mellett)</li>
          <li><strong>Resend Inc.</strong> — tranzakciós email küldés (USA, megfelelő garanciák mellett)</li>
          <li><strong>Google LLC</strong> — naptárszinkronizáció, ha a felhasználó csatlakoztatja Google fiókját</li>
        </ul>
        <p>Adatait harmadik félnek marketing vagy egyéb célból nem adjuk át.</p>
      </>
    },
    {
      title: '6. Az érintett jogai',
      content: <>
        <p>A GDPR alapján Önt az alábbi jogok illetik meg:</p>
        <ul>
          <li><strong>Hozzáférés joga</strong> — kérheti, hogy tájékoztassuk a kezelt adatairól</li>
          <li><strong>Helyesbítés joga</strong> — kérheti pontatlan adatainak javítását</li>
          <li><strong>Törlés joga</strong> — kérheti adatainak törlését (&quot;elfeledtetéshez való jog&quot;)</li>
          <li><strong>Adathordozhatóság joga</strong> — kérheti adatait géppel olvasható formátumban</li>
          <li><strong>Tiltakozás joga</strong> — tiltakozhat az adatkezelés ellen</li>
        </ul>
        <p>Kérelmét az alábbi email címen nyújthatja be: {emailLink}</p>
        <p>Panasszal a <strong>Nemzeti Adatvédelmi és Információszabadság Hatósághoz</strong> (NAIH) fordulhat: <a href="https://naih.hu" target="_blank" rel="noopener noreferrer" style={{ color: '#2563eb' }}>naih.hu</a></p>
      </>
    },
    {
      title: '7. Cookie-k (Sütik)',
      content: <>
        <p>A CLERICITY kizárólag <strong>technikai szükségesség szempontjából elengedhetetlen</strong> cookie-kat használ a bejelentkezési munkamenet fenntartásához. Ezek a sütik marketing vagy nyomkövetési célokat nem szolgálnak.</p>
        <p>A sütik automatikusan törlődnek a böngésző bezárásakor vagy a munkamenet lejártakor.</p>
      </>
    },
    {
      title: '8. Adatbiztonság',
      content: <>
        <p>Az adatok védelme érdekében az iparági szabványoknak megfelelő biztonsági intézkedéseket alkalmazunk: titkosított adatátvitel (HTTPS/TLS), hozzáférés-vezérlés és rendszeres biztonsági felülvizsgálat.</p>
      </>
    },
    {
      title: '9. Módosítások',
      content: <>
        <p>Fenntartjuk a jogot ezen tájékoztató módosítására. Lényeges változás esetén emailben értesítjük az érintetteket. A tájékoztató aktuális verziója mindig ezen az oldalon érhető el.</p>
      </>
    },
  ]
}

function enSections(emailLink: React.ReactNode) {
  return [
    {
      title: '1. Data Controller',
      content: <>
        <p>The data controller is the operator of the <strong>CLERICITY</strong> online booking platform.</p>
        <p>Contact: {emailLink}</p>
      </>
    },
    {
      title: '2. Purpose and Legal Basis',
      content: <>
        <p>The CLERICITY booking system processes personal data for the following purposes:</p>
        <ul>
          <li>Processing and confirming online bookings</li>
          <li>Sending booking-related email notifications</li>
          <li>Managing business accounts and staff profiles</li>
          <li>Calendar synchronization (Google Calendar integration)</li>
        </ul>
        <p>Legal basis: <strong>consent of the data subject</strong> (GDPR Art. 6(1)(a)) and <strong>performance of a contract</strong> (GDPR Art. 6(1)(b)).</p>
      </>
    },
    {
      title: '3. Data Processed',
      content: <>
        <p><strong>For booking guests:</strong></p>
        <ul>
          <li>Last name and first name</li>
          <li>Email address</li>
          <li>Phone number</li>
          <li>Booking date and service name</li>
        </ul>
        <p><strong>For business owners:</strong></p>
        <ul>
          <li>Business name, description, logo</li>
          <li>Email address, phone number</li>
          <li>Unique booking page identifier (slug)</li>
          <li>Google Calendar access token (if connected)</li>
        </ul>
        <p><strong>For staff members:</strong></p>
        <ul>
          <li>Name, email address, phone number</li>
          <li>Profile photo, age, bio</li>
          <li>Reference work photos (max. 7)</li>
        </ul>
      </>
    },
    {
      title: '4. Retention Period',
      content: <>
        <p>Personal data related to bookings is retained for <strong>1 year</strong> from the booking date, after which it is deleted.</p>
        <p>Business account data is stored until account deletion. Upon deletion, all associated data is permanently removed.</p>
      </>
    },
    {
      title: '5. Data Transfers and Processors',
      content: <>
        <p>We share data with the following third-party processors, solely to the extent necessary to provide the service:</p>
        <ul>
          <li><strong>Supabase Inc.</strong> — database and storage (USA, with appropriate safeguards)</li>
          <li><strong>Resend Inc.</strong> — transactional email delivery (USA, with appropriate safeguards)</li>
          <li><strong>Google LLC</strong> — calendar synchronization, if the user connects their Google account</li>
        </ul>
        <p>We do not share your data with third parties for marketing or other purposes.</p>
      </>
    },
    {
      title: '6. Your Rights',
      content: <>
        <p>Under GDPR, you have the following rights:</p>
        <ul>
          <li><strong>Right of access</strong> — you may request information about the data we process about you</li>
          <li><strong>Right to rectification</strong> — you may request correction of inaccurate data</li>
          <li><strong>Right to erasure</strong> — you may request deletion of your data (&quot;right to be forgotten&quot;)</li>
          <li><strong>Right to data portability</strong> — you may request your data in a machine-readable format</li>
          <li><strong>Right to object</strong> — you may object to the processing of your data</li>
        </ul>
        <p>Submit your request to: {emailLink}</p>
        <p>You may also file a complaint with the <strong>National Authority for Data Protection and Freedom of Information</strong> (NAIH): <a href="https://naih.hu" target="_blank" rel="noopener noreferrer" style={{ color: '#2563eb' }}>naih.hu</a></p>
      </>
    },
    {
      title: '7. Cookies',
      content: <>
        <p>CLERICITY uses only <strong>technically necessary</strong> cookies to maintain login sessions. These cookies do not serve marketing or tracking purposes.</p>
        <p>Cookies are automatically deleted when the browser is closed or the session expires.</p>
      </>
    },
    {
      title: '8. Data Security',
      content: <>
        <p>We apply industry-standard security measures to protect your data: encrypted data transfer (HTTPS/TLS), access control, and regular security reviews.</p>
      </>
    },
    {
      title: '9. Amendments',
      content: <>
        <p>We reserve the right to modify this policy. In case of significant changes, we will notify affected users by email. The current version is always available on this page.</p>
      </>
    },
  ]
}

function skSections(emailLink: React.ReactNode) {
  return [
    {
      title: '1. Prevádzkovateľ',
      content: <>
        <p>Prevádzkovateľom je prevádzkovateľ online rezervačnej platformy <strong>CLERICITY</strong>.</p>
        <p>Kontakt: {emailLink}</p>
      </>
    },
    {
      title: '2. Účel a právny základ',
      content: <>
        <p>Rezervačný systém CLERICITY spracúva osobné údaje na nasledujúce účely:</p>
        <ul>
          <li>Spracovanie a potvrdenie online rezervácií</li>
          <li>Zasielanie emailových notifikácií súvisiacich s rezerváciou</li>
          <li>Správa obchodných účtov a profilov zamestnancov</li>
          <li>Synchronizácia kalendára (integrácia Google Kalendára)</li>
        </ul>
        <p>Právny základ: <strong>súhlas dotknutej osoby</strong> (čl. 6 ods. 1 písm. a) GDPR) a <strong>plnenie zmluvy</strong> (čl. 6 ods. 1 písm. b) GDPR).</p>
      </>
    },
    {
      title: '3. Rozsah spracúvaných údajov',
      content: <>
        <p><strong>Pre osoby vykonávajúce rezervácie (zákazníci):</strong></p>
        <ul>
          <li>Priezvisko a meno</li>
          <li>Emailová adresa</li>
          <li>Telefónne číslo</li>
          <li>Dátum rezervácie a názov služby</li>
        </ul>
        <p><strong>Pre majiteľov firiem:</strong></p>
        <ul>
          <li>Názov firmy, popis, logo</li>
          <li>Emailová adresa, telefónne číslo</li>
          <li>Jedinečný identifikátor rezervačnej stránky (slug)</li>
          <li>Prístupový token Google Kalendára (ak je prepojený)</li>
        </ul>
        <p><strong>Pre zamestnancov:</strong></p>
        <ul>
          <li>Meno, emailová adresa, telefónne číslo</li>
          <li>Profilová fotografia, vek, predstavenie</li>
          <li>Referenčné fotografie prác (max. 7)</li>
        </ul>
      </>
    },
    {
      title: '4. Doba uchovávania',
      content: <>
        <p>Osobné údaje súvisiace s rezerváciami uchovávame <strong>1 rok</strong> od dátumu rezervácie, potom ich vymažeme.</p>
        <p>Údaje obchodných účtov sa uchovávajú až do zrušenia účtu. Pri zrušení účtu sa všetky súvisiace údaje trvalo odstránia.</p>
      </>
    },
    {
      title: '5. Prenos údajov a sprostredkovatelia',
      content: <>
        <p>Vaše údaje zdieľame s nasledujúcimi externými poskytovateľmi, výlučne v rozsahu potrebnom na poskytovanie služby:</p>
        <ul>
          <li><strong>Supabase Inc.</strong> — databáza a úložisko (USA, s príslušnými zárukami)</li>
          <li><strong>Resend Inc.</strong> — transakčné emailové doručovanie (USA, s príslušnými zárukami)</li>
          <li><strong>Google LLC</strong> — synchronizácia kalendára, ak používateľ prepojí svoj účet Google</li>
        </ul>
        <p>Vaše údaje neposkytujeme tretím stranám na marketingové ani iné účely.</p>
      </>
    },
    {
      title: '6. Vaše práva',
      content: <>
        <p>Podľa GDPR máte nasledujúce práva:</p>
        <ul>
          <li><strong>Právo na prístup</strong> — môžete požiadať o informácie o údajoch, ktoré o vás spracúvame</li>
          <li><strong>Právo na opravu</strong> — môžete požiadať o opravu nesprávnych údajov</li>
          <li><strong>Právo na vymazanie</strong> — môžete požiadať o vymazanie vašich údajov (&quot;právo byť zabudnutý&quot;)</li>
          <li><strong>Právo na prenosnosť</strong> — môžete požiadať o vaše údaje v strojovo čitateľnom formáte</li>
          <li><strong>Právo namietať</strong> — môžete namietať proti spracúvaniu vašich údajov</li>
        </ul>
        <p>Svoju žiadosť podajte na: {emailLink}</p>
        <p>Sťažnosť môžete podať na <strong>Úrad na ochranu osobných údajov Slovenskej republiky</strong>: <a href="https://dataprotection.gov.sk" target="_blank" rel="noopener noreferrer" style={{ color: '#2563eb' }}>dataprotection.gov.sk</a></p>
      </>
    },
    {
      title: '7. Súbory cookie',
      content: <>
        <p>CLERICITY používa iba <strong>technicky nevyhnutné</strong> súbory cookie na udržanie prihlásenia. Tieto cookies neslúžia na marketingové ani sledovacie účely.</p>
        <p>Cookies sa automaticky odstránia pri zatvorení prehliadača alebo po vypršaní relácie.</p>
      </>
    },
    {
      title: '8. Bezpečnosť údajov',
      content: <>
        <p>Na ochranu vašich údajov uplatňujeme bezpečnostné opatrenia v súlade s priemyselnými štandardmi: šifrovaný prenos dát (HTTPS/TLS), riadenie prístupu a pravidelné bezpečnostné kontroly.</p>
      </>
    },
    {
      title: '9. Zmeny',
      content: <>
        <p>Vyhradzujeme si právo upraviť tieto zásady. V prípade podstatných zmien vás budeme informovať emailom. Aktuálna verzia je vždy dostupná na tejto stránke.</p>
      </>
    },
  ]
}
