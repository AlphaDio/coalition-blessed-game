// UI Formatting Utilities

/**
 * Formats a number with a fixed number of decimal places
 * @param {number} value - The value to format
 * @param {number} decimals - Number of decimal places (default: 0)
 * @returns {string} Formatted number
 */
export function formatNumber(value, decimals = 0) {
  if (value === null || value === undefined || isNaN(value)) {
    return 'N/A';
  }
  return value.toFixed(decimals);
}

/**
 * Formats a percentage value
 * @param {number} value - The value (0-100)
 * @param {number} decimals - Number of decimal places (default: 0)
 * @returns {string} Formatted percentage
 */
export function formatPercent(value, decimals = 0) {
  return formatNumber(value, decimals) + '%';
}

/**
 * Formats a cohesion value with tier name
 * @param {number} cohesion - Cohesion value (0-100)
 * @param {Object} tier - Cohesion tier object with name property
 * @returns {string} Formatted cohesion with tier
 */
export function formatCohesion(cohesion, tier) {
  const tierName = tier ? tier.name : 'COLLAPSED';
  return `${formatNumber(cohesion, 1)} (${tierName})`;
}

/**
 * Creates a visual progress bar
 * @param {number} value - Current value
 * @param {number} max - Maximum value
 * @param {number} width - Width of the bar in characters
 * @param {string} fillChar - Character to use for filled portion (default: '█')
 * @param {string} emptyChar - Character to use for empty portion (default: '░')
 * @returns {string} Visual progress bar
 */
export function createProgressBar(value, max, width, fillChar = '█', emptyChar = '░') {
  if (max === 0) return emptyChar.repeat(width);
  const ratio = Math.max(0, Math.min(1, value / max));
  const filledWidth = Math.round(ratio * width);
  const emptyWidth = width - filledWidth;
  return fillChar.repeat(filledWidth) + emptyChar.repeat(emptyWidth);
}

/**
 * Formats a resource stockpile display
 * @param {string} name - Resource name
 * @param {number} amount - Current amount
 * @returns {string} Formatted resource line
 */
export function formatResource(name, amount) {
  return `${name}: ${formatNumber(amount, 0)}`;
}

/**
 * Formats army stats for display
 * @param {Object} army - Army object
 * @returns {string} Formatted army stats
 */
export function formatArmyStats(army) {
  return `Fervor: ${formatNumber(army.fervor)}, Org: ${formatNumber(army.organization)}`;
}

/**
 * Truncates text to a maximum length with ellipsis
 * @param {string} text - Text to truncate
 * @param {number} maxLength - Maximum length
 * @returns {string} Truncated text
 */
export function truncateText(text, maxLength) {
  if (!text) return '';
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength - 3) + '...';
}

/**
 * Pads text to a specific width
 * @param {string} text - Text to pad
 * @param {number} width - Target width
 * @param {string} align - Alignment: 'left', 'right', 'center' (default: 'left')
 * @returns {string} Padded text
 */
export function padText(text, width, align = 'left') {
  if (!text) text = '';
  const textLength = text.length;
  if (textLength >= width) return text;
  
  const padding = width - textLength;
  switch (align) {
    case 'right':
      return ' '.repeat(padding) + text;
    case 'center':
      const leftPad = Math.floor(padding / 2);
      const rightPad = padding - leftPad;
      return ' '.repeat(leftPad) + text + ' '.repeat(rightPad);
    default: // 'left'
      return text + ' '.repeat(padding);
  }
}
