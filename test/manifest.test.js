const manifest = require('../manifest.json');

const expectedHostMatches = [
  'https://teams.microsoft.com/*',
  'https://*.sharepoint.com/*',
  'https://drive.google.com/*'
];

function allConfiguredHostPatterns() {
  return [
    ...manifest.host_permissions,
    ...manifest.content_scripts.flatMap(script => script.matches)
  ];
}

describe('manifest host scope', () => {
  test('uses only HTTPS host patterns', () => {
    expect(allConfiguredHostPatterns().every(pattern => pattern.startsWith('https://'))).toBe(true);
  });

  test('does not run on all microsoft.com subdomains', () => {
    expect(allConfiguredHostPatterns()).not.toContain('*://*.microsoft.com/*');
    expect(allConfiguredHostPatterns()).not.toContain('https://*.microsoft.com/*');
  });

  test('keeps content script matches aligned with host permissions', () => {
    expect(manifest.host_permissions).toEqual(expectedHostMatches);
    for (const script of manifest.content_scripts) {
      expect(script.matches).toEqual(expectedHostMatches);
    }
  });
});
