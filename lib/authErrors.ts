/**
 * Maps Supabase English auth error messages to Romanian user-facing strings.
 */
const ERROR_MAP: Record<string, string> = {
  "Invalid login credentials": "Email sau parolă incorecte",
  "invalid login credentials": "Email sau parolă incorecte",
  "User already registered": "Acest email este deja înregistrat",
  "user already registered": "Acest email este deja înregistrat",
  "Email not confirmed": "Emailul nu a fost confirmat. Verifică inbox-ul.",
  "email not confirmed": "Emailul nu a fost confirmat. Verifică inbox-ul.",
  "Password should be at least 6 characters":
    "Parola trebuie să aibă cel puțin 6 caractere",
  "password should be at least 6 characters":
    "Parola trebuie să aibă cel puțin 6 caractere",
  "For security purposes, you can only request this after":
    "Prea multe cereri. Încearcă din nou mai târziu.",
  "Email rate limit exceeded": "Prea multe cereri. Încearcă din nou mai târziu.",
  "Too many requests": "Prea multe cereri. Încearcă din nou mai târziu.",
  "Unable to validate email address: invalid format":
    "Adresa de email este invalidă",
  "Signup requires a valid password": "Parola introdusă nu este validă",
  "Anonymous sign-ins are disabled": "Autentificarea anonimă nu este permisă",
};

/**
 * Returns a Romanian translation of a Supabase auth error message,
 * falling back to the original message if no mapping exists.
 */
export function mapAuthError(message: string): string {
  // Exact match first
  if (ERROR_MAP[message]) return ERROR_MAP[message];

  // Partial / contains match for longer dynamic messages
  for (const [key, value] of Object.entries(ERROR_MAP)) {
    if (message.toLowerCase().includes(key.toLowerCase())) return value;
  }

  return message;
}
