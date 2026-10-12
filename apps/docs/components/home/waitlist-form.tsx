'use client'

import { useId, useState, type FormEvent } from 'react'

type FieldErrors = { email?: string; repo?: string; consent?: string }
type Status = 'idle' | 'submitting' | 'success' | 'error'

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u
const REQUEST_TIMEOUT_MS = 15_000

function isHttpsUrl(value: string) {
  try {
    return new URL(value).protocol === 'https:'
  } catch {
    return false
  }
}

/**
 * Early-access waitlist. The page renders this only when NEXT_PUBLIC_WAITLIST_URL is set at build time,
 * so `endpoint` is always an https URL here. No third-party scripts and no cookies: the request is a
 * credential-free CORS POST of JSON.
 */
export function WaitlistForm({ endpoint }: { readonly endpoint: string }) {
  const id = useId()
  const [email, setEmail] = useState('')
  const [repo, setRepo] = useState('')
  const [consent, setConsent] = useState(false)
  const [website, setWebsite] = useState('')
  const [errors, setErrors] = useState<FieldErrors>({})
  const [status, setStatus] = useState<Status>('idle')

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const trimmedEmail = email.trim()
    const trimmedRepo = repo.trim()
    const nextErrors: FieldErrors = {}
    if (!EMAIL_PATTERN.test(trimmedEmail)) nextErrors.email = 'Enter a valid email address.'
    if (trimmedRepo && !isHttpsUrl(trimmedRepo)) nextErrors.repo = 'Use a full https:// URL, or leave this empty.'
    if (!consent) nextErrors.consent = 'Consent is required to join the waitlist.'
    setErrors(nextErrors)
    if (Object.keys(nextErrors).length > 0) return

    setStatus('submitting')
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        mode: 'cors',
        credentials: 'omit',
        referrerPolicy: 'no-referrer',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ email: trimmedEmail, repo: trimmedRepo, consent: true, website }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      setEmail('')
      setRepo('')
      setConsent(false)
      setWebsite('')
      setStatus('success')
    } catch {
      setStatus('error')
    }
  }

  const emailError = `${id}-email-error`
  const repoError = `${id}-repo-error`
  const consentError = `${id}-consent-error`

  return (
    <section id="early-access" className="bridge-waitlist" aria-labelledby={`${id}-title`}>
      <div className="bridge-waitlist-inner">
        <div className="bridge-section-heading">
          <p className="bridge-eyebrow">EARLY ACCESS</p>
          <h2 id={`${id}-title`}>Hosted documentation maintenance from AgentsKit</h2>
          <p>Join the waitlist. We will contact you when early access opens.</p>
        </div>

        {status === 'success' ? (
          <p className="bridge-waitlist-status" role="status">Thanks. You are on the early-access list.</p>
        ) : (
          <form className="bridge-waitlist-form" aria-label="Early access waitlist" noValidate onSubmit={onSubmit}>
            <div className="bridge-waitlist-field">
              <label htmlFor={`${id}-email`}>Email <span aria-hidden>(required)</span></label>
              <input
                id={`${id}-email`}
                name="email"
                type="email"
                autoComplete="email"
                required
                aria-required="true"
                aria-invalid={errors.email ? 'true' : undefined}
                aria-describedby={errors.email ? emailError : undefined}
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
              {errors.email ? <p id={emailError} className="bridge-waitlist-error">{errors.email}</p> : null}
            </div>

            <div className="bridge-waitlist-field">
              <label htmlFor={`${id}-repo`}>Repository URL <span>(optional)</span></label>
              <input
                id={`${id}-repo`}
                name="repo"
                type="url"
                inputMode="url"
                autoComplete="url"
                placeholder="https://github.com/owner/repository"
                aria-invalid={errors.repo ? 'true' : undefined}
                aria-describedby={errors.repo ? repoError : undefined}
                value={repo}
                onChange={(event) => setRepo(event.target.value)}
              />
              {errors.repo ? <p id={repoError} className="bridge-waitlist-error">{errors.repo}</p> : null}
            </div>

            <div className="bridge-waitlist-consent">
              <input
                id={`${id}-consent`}
                name="consent"
                type="checkbox"
                required
                aria-required="true"
                aria-invalid={errors.consent ? 'true' : undefined}
                aria-describedby={`${id}-privacy${errors.consent ? ` ${consentError}` : ''}`}
                checked={consent}
                onChange={(event) => setConsent(event.target.checked)}
              />
              <label htmlFor={`${id}-consent`}>I agree to be contacted about early access.</label>
              <p id={`${id}-privacy`} className="bridge-waitlist-privacy">Emails are used only to contact you about early access and are deleted on request.</p>
              {errors.consent ? <p id={consentError} className="bridge-waitlist-error">{errors.consent}</p> : null}
            </div>

            {/* Honeypot: hidden from people and assistive technology; bots that fill it are dropped by the endpoint. */}
            <div className="bridge-waitlist-trap" aria-hidden="true">
              <label htmlFor={`${id}-website`}>Website</label>
              <input id={`${id}-website`} name="website" type="text" tabIndex={-1} autoComplete="off" value={website} onChange={(event) => setWebsite(event.target.value)} />
            </div>

            <button type="submit" className="bridge-button bridge-button-primary bridge-waitlist-submit" disabled={status === 'submitting'}>
              {status === 'submitting' ? 'Sending…' : 'Join the waitlist'}
            </button>

            {status === 'error' ? (
              <p className="bridge-waitlist-error" role="alert">We could not record your request. Try again in a few minutes.</p>
            ) : null}
          </form>
        )}
      </div>
    </section>
  )
}
