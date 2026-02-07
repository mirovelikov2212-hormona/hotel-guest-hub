export function buildWhatsAppLink(whatsDigits: string, text: string) {
  const msg = encodeURIComponent(text);
  return `https://wa.me/${whatsDigits}?text=${msg}`;
}

export function safeTelLink(phone: string) {
  const clean = phone.replace(/\s+/g, "");
  return `tel:${clean}`;
}

export function isAfterCutoffLocal(cutoffHHMM: string) {
  const [h, m] = cutoffHHMM.split(":").map((x) => parseInt(x, 10));
  const now = new Date();
  const cutoff = new Date();
  cutoff.setHours(h, m, 0, 0);
  return now.getTime() >= cutoff.getTime();
}
