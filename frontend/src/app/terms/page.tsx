import type { Metadata } from "next";
import { PageContainer, PageHeader } from "@/shared/layout/PageContainer";

export const metadata: Metadata = {
  title: "Terms & Conditions - xFPL",
  description: "The terms governing use of the xFPL Fantasy Premier League analytics service.",
};

type Section = { h: string; body: string | string[] };

const SECTIONS: Section[] = [
  {
    h: "1. Who we are",
    body: 'xFPL ("xFPL", "we", "us", "our") is an independent Fantasy Premier League analytics website operated in the United Kingdom. These Terms govern your access to and use of xfpl.co.uk and its features (the "Service").',
  },
  {
    h: "2. Acceptance of these terms",
    body: "By accessing or using the Service you agree to these Terms and to our Privacy Policy. If you do not agree, please do not use the Service.",
  },
  {
    h: "3. No affiliation with the Premier League or FPL",
    body: "xFPL is not affiliated with, endorsed by, sponsored by, or in any way officially connected to the Premier League, The Football Association Premier League Limited, the official Fantasy Premier League game, or any football club. All club names, badges, kits and player images remain the property of their respective owners and are used here purely for identification and editorial purposes.",
  },
  {
    h: "4. Informational purposes only",
    body: "The Service provides statistical models, predictions, rankings and suggestions to help you make your own Fantasy Premier League decisions. These are estimates only. Fantasy football involves significant chance, and past performance is not a reliable indicator of future results. We do not warrant or guarantee the accuracy, completeness, timeliness or outcome of any prediction, ranking or suggestion. You are solely responsible for your own team selections, transfers, chip usage and any decisions you make.",
  },
  {
    h: "5. Not betting or financial advice",
    body: "The Service does not offer, facilitate, promote or process any betting, gambling, wagering, prizes, sweepstakes or real-money play. Nothing on the Service constitutes betting, investment, tax, legal or financial advice.",
  },
  {
    h: "6. Acceptable use",
    body: [
      "You agree not to use the Service unlawfully or in breach of these Terms.",
      "You agree not to disrupt, overload, scrape at scale, reverse-engineer, or attempt to gain unauthorised access to the Service or its infrastructure.",
      "You agree not to misrepresent any affiliation with xFPL, or use the Service to infringe the rights of others.",
      "You are responsible for any team ID, league ID or other information you choose to enter.",
    ],
  },
  {
    h: "7. Third-party data",
    body: "The Service relies on data from third-party sources, including the publicly available Fantasy Premier League API and community datasets. That data may be inaccurate, incomplete, delayed or unavailable, and may change without notice. We are not responsible for third-party data, nor for the content of any third-party website linked from the Service.",
  },
  {
    h: "8. Intellectual property",
    body: "The Service's original design, code, text and branding are owned by xFPL or its licensors. Subject to these Terms, you may use the Service for your personal, non-commercial Fantasy Premier League use. You may not copy, resell, republish or redistribute the Service or its content without our prior written permission.",
  },
  {
    h: "9. Availability",
    body: 'The Service is provided "as is" and "as available". We may change, suspend, limit or discontinue any part of the Service at any time and without notice. We do not warrant that the Service will be uninterrupted, secure or error-free.',
  },
  {
    h: "10. Limitation of liability",
    body: "To the fullest extent permitted by law, xFPL will not be liable for any indirect, incidental, special or consequential loss, nor for any loss of profits, data, mini-league position or opportunity, arising out of or in connection with your use of (or inability to use) the Service or any reliance on its content. Nothing in these Terms excludes or limits any liability that cannot be excluded or limited under English law, including liability for death or personal injury caused by negligence, or for fraud or fraudulent misrepresentation.",
  },
  {
    h: "11. Changes to these terms",
    body: 'We may update these Terms from time to time. Changes take effect when posted on this page, and the "last updated" date above will be revised. Your continued use of the Service after changes are posted constitutes acceptance of the updated Terms.',
  },
  {
    h: "12. Governing law",
    body: "These Terms, and any dispute or claim arising out of or in connection with them, are governed by the laws of England and Wales. The courts of England and Wales have exclusive jurisdiction, without prejudice to any mandatory consumer-protection rights available to you in your country of residence.",
  },
  {
    h: "13. Contact",
    body: "Questions about these Terms can be sent to legal@xfpl.co.uk.",
  },
];

export default function TermsPage() {
  return (
    <PageContainer>
      <PageHeader title="Terms & Conditions" subtitle="Last updated 27 July 2026" />
      <div className="flex max-w-2xl flex-col gap-5 text-sm leading-relaxed text-text-secondary">
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
