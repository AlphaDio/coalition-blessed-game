let orderIdCounter = 0;

export function nextOrderId(prefix) {
  return `${prefix}_${orderIdCounter++}`;
}
