/**
 * Notification templates — deterministic Egyptian Arabic copy (no AI).
 * Each template ends with {link} placeholder for the deep link.
 *
 * Spec ref: spec_negotiation_4.md §3.3
 */

export interface TemplateVars {
  price?: string;
  title?: string;
  link: string;
}

/** WhatsApp body templates keyed by NotificationType */
export const WHATSAPP_TEMPLATES: Record<string, (vars: TemplateVars) => string> = {
  OFFER_PROPOSED: (v) =>
    `السلام عليكم، المشتري قدّم عرض بسعر **${v.price ?? '-'} ج.م** على عقارك «${v.title ?? '-'}». ادخل النظام للمتابعة: ${v.link}`,

  OFFER_ACCEPTED: (v) =>
    `تم قبول عرضك على «${v.title ?? '-'}». ادخل النظام لإكمال الخطوات: ${v.link}`,

  OFFER_REJECTED: (v) =>
    `البائع رفض العرض على «${v.title ?? '-'}». ادخل النظام لمراجعة الخيارات: ${v.link}`,

  OFFER_COUNTERED: (v) =>
    `البائع قدّم عرض مضاد بسعر **${v.price ?? '-'} ج.م** على «${v.title ?? '-'}». ادخل النظام للمتابعة: ${v.link}`,

  NEGOTIATION_AGREED: (v) =>
    `اتفقتوا على **${v.price ?? '-'} ج.م** للعقار «${v.title ?? '-'}» 🎉. ادخل النظام لإكمال الدفع: ${v.link}`,

  NEGOTIATION_FAILED: (v) =>
    `تم إنهاء التفاوض على «${v.title ?? '-'}». ادخل النظام لاستعراض التفاصيل: ${v.link}`,
};

/** In-app title templates keyed by NotificationType */
export const NOTIFICATION_TITLES: Record<string, (vars: TemplateVars) => string> = {
  OFFER_PROPOSED: () => 'عرض جديد على عقارك',
  OFFER_ACCEPTED: (v) => `تم قبول عرضك على «${v.title ?? '-'}»`,
  OFFER_REJECTED: (v) => `تم رفض العرض على «${v.title ?? '-'}»`,
  OFFER_COUNTERED: (v) => `عرض مضاد على «${v.title ?? '-'}»`,
  NEGOTIATION_AGREED: (v) => `تم الاتفاق على «${v.title ?? '-'}» 🎉`,
  NEGOTIATION_FAILED: (v) => `تم إنهاء التفاوض على «${v.title ?? '-'}»`,
};

/** In-app body templates keyed by NotificationType */
export const NOTIFICATION_BODIES: Record<string, (vars: TemplateVars) => string> = {
  OFFER_PROPOSED: (v) =>
    `المشتري قدّم عرض بسعر ${v.price ?? '-'} ج.م على عقارك «${v.title ?? '-'}».`,
  OFFER_ACCEPTED: (v) =>
    `تم قبول عرضك على «${v.title ?? '-'}». تقدر تكمل الخطوات.`,
  OFFER_REJECTED: (v) =>
    `البائع رفض العرض على «${v.title ?? '-'}».`,
  OFFER_COUNTERED: (v) =>
    `البائع قدّم عرض مضاد بسعر ${v.price ?? '-'} ج.م على «${v.title ?? '-'}».`,
  NEGOTIATION_AGREED: (v) =>
    `اتفقتوا على ${v.price ?? '-'} ج.م للعقار «${v.title ?? '-'}».`,
  NEGOTIATION_FAILED: (v) =>
    `تم إنهاء التفاوض على «${v.title ?? '-'}».`,
};

/**
 * Build a deep link for a notification.
 *
 * | Audience             | Link template                                              |
 * |----------------------|-----------------------------------------------------------|
 * | Seller (offer-proposed) | /seller-action/{escalationToken}                       |
 * | Seller (other)       | /notifications/{notificationId} → opens neg page seller  |
 * | Buyer                | /negotiation/{negotiationId}                              |
 */
export function buildDeepLink(opts: {
  notificationId: string;
  negotiationId: string;
  role: 'buyer' | 'seller';
  escalationToken?: string;
}): string {
  if (opts.role === 'seller' && opts.escalationToken) {
    return `/seller-action/${opts.escalationToken}`;
  }
  if (opts.role === 'seller') {
    return `/negotiation/${opts.negotiationId}?role=seller`;
  }
  // Buyer
  return `/negotiation/${opts.negotiationId}`;
}
