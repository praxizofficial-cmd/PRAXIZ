"use client";
import { MailCheck, ShieldCheck, LogIn } from "lucide-react";
import { usePublicPreview } from "./usePublicPreview";
import { usePublicContentTransition } from "./usePublicContentTransition";

const steps = [
  { title: "Verify your email address", icon: MailCheck, text: "Open the verification message sent to your institutional inbox.", help: "Check your inbox and spam folder. Follow the verification link to confirm email ownership. Email verification alone does not approve your account." },
  { title: "Institutional review", icon: ShieldCheck, text: "Your registration remains pending until an authorized reviewer approves it.", help: "An authorized administrator reviews your institutional identity and academic information. This page does not confirm an approval decision." },
  { title: "Sign in after approval", icon: LogIn, text: "Use your institutional email address and password after completing the required verification and approval steps.", help: "Return to sign in after email verification and institutional approval. Use the credentials you created; do not submit another registration to check your status." },
];
export function RegistrationJourney() {
  const preview = usePublicPreview();
  const transition = usePublicContentTransition(preview.active);
  return <section className="registration-journey" aria-label="Registration journey">
    <h2>Your registration journey</h2><p>Next steps, not verified completion states.</p>
    <ol>{steps.map(({ title, icon: Icon }, index) => <li key={title}><button type="button" {...preview.controls(index)} className={preview.active === index ? "is-active" : ""} aria-controls="registration-journey-description"><span>{String(index + 1).padStart(2, "0")}</span><strong>{title}</strong><Icon size={22} aria-hidden="true" /></button></li>)}</ol>
    <div ref={transition} id="registration-journey-description" className="journey-explanation" aria-live="polite"><h3>{steps[preview.active].title}</h3><p>{steps[preview.active].text}</p><details key={preview.active}><summary>Helpful instructions</summary><p>{steps[preview.active].help}</p></details></div>
  </section>;
}
