export const DEFAULT_INVOICE_MESSAGE_TEMPLATE =
  'Здравствуйте, {имя}! Ссылка на оплату «{пакет}» на сумму {сумма}:\n{ссылка}'

export function renderInvoiceTemplate(
  template: string,
  vars: { имя: string; пакет: string; сумма: string; ссылка: string }
): string {
  return template
    .replaceAll('{имя}', vars.имя)
    .replaceAll('{пакет}', vars.пакет)
    .replaceAll('{сумма}', vars.сумма)
    .replaceAll('{ссылка}', vars.ссылка)
}
