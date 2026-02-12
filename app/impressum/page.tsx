export default function ImpressumPage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-16 text-white">
      <h1 className="text-3xl font-semibold mb-6">Impressum</h1>

      <p>Angaben gemäß § 5 TMG</p>

      <p className="mt-4">
        <strong>[Твоето име / фирма]</strong><br/>
        [Улица и номер]<br/>
        [Пощенски код, град]<br/>
        Deutschland
      </p>

      <p className="mt-4">
        E-Mail: [имейл]<br/>
        Telefon: [по желание]
      </p>

      <p className="mt-4">
        Umsatzsteuer-ID: [ако имаш]
      </p>

      <h2 className="text-xl font-semibold mt-10">Haftung für Inhalte</h2>
      <p className="mt-2 text-slate-300">
        Als Diensteanbieter sind wir gemäß § 7 Abs.1 TMG für eigene Inhalte verantwortlich...
      </p>
    </main>
  );
}
