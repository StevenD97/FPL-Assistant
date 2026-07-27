import type { Metadata } from "next";
import { PageContainer, PageHeader } from "@/shared/layout/PageContainer";

export const metadata: Metadata = {
  title: "Privacy Policy - xFPL",
  description: "How xFPL handles data. No account required; team and league IDs stay in your browser.",
};

type Section = { h: string; body: string | string[] };

const SECTIONS: Section[] = [
  {
    h: "1. Overview",
    body: 'This Privacy Policy explains how xFPL ("we", "us", "our") handles information when you use xfpl.co.uk (the "Service"). We are the controller for the limited personal data described below, and we aim to collect as little as possible.',
  },
  {
    h: "2. No account required",
    body: "You do not need to create an account or provide your name, email address or a password to use the Service.",
  },
  {
    h: "3. Information we handle",
    body: [
      "Team and league IDs: if you connect your team or track a league, we store those numeric IDs in your browser's local storage, on your own device. They are not stored on our servers, and you can remove them at any time by disconnecting your team or clearing your browser storage.",
      "Public FPL data: when you connect a team or league, your browser (and our backend acting on your behalf) requests the corresponding publicly available data from the Fantasy Premier League API using that public ID. We never receive your FPL login or password.",
      "Technical and usage data: as with most websites, our hosting providers automatically process standard technical information (such as IP address, browser type and pages requested) in server logs for security, diagnostics and reliability. We may also use privacy-respecting, aggregate analytics that do not identify you individually.",
    ],
  },
  {
    h: "4. Cookies and local storage",
    body: "We do not use advertising or cross-site tracking cookies. We use your browser's local storage to remember your connected team and tracked leagues so you do not have to re-enter them. Any strictly necessary cookies set by our hosting or content-delivery providers are used only to deliver the Service.",
  },
  {
    h: "5. How we use information",
    body: "We use the information above solely to provide the features you request (such as your squad, leagues and recommendations), to maintain the security and reliability of the Service, and to understand in aggregate how the Service is used. We do not sell your personal data.",
  },
  {
    h: "6. Sharing and third parties",
    body: "We share data only as needed to run the Service: with the Fantasy Premier League API (to fetch the public data you request), and with our hosting and infrastructure providers, who process technical data on our behalf. Some providers may process data outside the UK; where they do, appropriate safeguards are applied.",
  },
  {
    h: "7. Retention",
    body: "Team and league IDs remain in your browser's local storage until you remove them. Server logs are retained only for as long as needed for security and diagnostics, and are then deleted or anonymised.",
  },
  {
    h: "8. Your rights",
    body: "Under UK data protection law you have rights including access, correction, erasure, restriction and objection. Because we hold very little personal data and there is no account, you can exercise most of this control directly by clearing your browser storage. For anything else, contact us using the details below. You also have the right to complain to the Information Commissioner's Office (ICO).",
  },
  {
    h: "9. Children",
    body: "The Service is intended for a general audience and is not directed at children under 13, and we do not knowingly collect personal data from children.",
  },
  {
    h: "10. Changes to this policy",
    body: 'We may update this Policy from time to time; the "last updated" date above will change accordingly.',
  },
  {
    h: "11. Contact",
    body: "For privacy questions or requests, contact privacy@xfpl.co.uk.",
  },
];

export default function PrivacyPage() {
  return (
    <PageContainer>
      <PageHeader title="Privacy Policy" subtitle="Last updated 27 July 2026" />
      <div className="flex flex-col gap-5 text-sm leading-relaxed text-text-secondary">
        {SECTIONS.map((s) => (
          <section key={s.h}>
            <h2 className="mb-1.5 text-md font-semibold text-text-primary">{s.h}</h2>
            {Array.isArray(s.body) ? (
              <ul className="list-disc space-y-1 pl-5">
                {s.body.map((line, i) => (
                  <li key={i}>{line}</li>
                ))}
              </ul>
            ) : (
              <p>{s.body}</p>
            )}
          </section>
        ))}
      </div>
    </PageContainer>
  );
}
