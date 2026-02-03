// Karma configuration file for Angular testing
// Standard Angular CI testing setup using ChromeHeadlessNoSandbox

// Use Chromium for headless tests when Chrome is not installed (e.g. Linux with chromium only).
// ChromeHeadless launcher looks for CHROME_BIN or google-chrome; it does not look for chromium.
// Setting CHROME_BIN to the Chromium binary makes ChromeHeadless use it.
function resolveChromeBin() {
  if (process.env.CHROME_BIN) return;
  if (process.platform !== 'linux') return;
  const { execSync } = require('child_process');
  for (const name of ['chromium-browser', 'chromium']) {
    try {
      const bin = execSync(`command -v ${name} 2>/dev/null`, { encoding: 'utf8' }).trim();
      if (bin) {
        process.env.CHROME_BIN = bin;
        return;
      }
    } catch (_) {
      // command not found
    }
  }
}
resolveChromeBin();

module.exports = function (config) {
  // Simplified headless detection:
  // 1. Explicit USE_HEADLESS flag
  // 2. CI environment (always headless in CI)
  // 3. Allow override via KARMA_BROWSER for local debugging
  const useHeadlessExplicit =
    process.env.USE_HEADLESS === 'true' || process.env.USE_HEADLESS === '1';
  const isCI =
    process.env.CI === 'true' ||
    process.env.CI === '1' ||
    process.env.CONTINUOUS_INTEGRATION === 'true' ||
    process.env.GITHUB_ACTIONS === 'true' ||
    process.env.GITLAB_CI === 'true' ||
    process.env.JENKINS_URL !== undefined;

  // Allow explicit browser override for local debugging (e.g., KARMA_BROWSER=Chrome)
  const browserOverride = process.env.KARMA_BROWSER;

  // Use headless if explicitly requested or in CI (CI always uses headless)
  // Only use regular Chrome if explicitly overridden and not in CI
  const useHeadless = useHeadlessExplicit || isCI;
  const selectedBrowser =
    browserOverride && !isCI ? browserOverride : useHeadless ? 'ChromeHeadlessNoSandbox' : 'Chrome';

  config.set({
    basePath: '',
    frameworks: ['jasmine', '@angular-devkit/build-angular'],
    plugins: [
      require('karma-jasmine'),
      require('karma-chrome-launcher'),
      require('karma-jasmine-html-reporter'),
      require('karma-coverage'),
    ],
    client: {
      jasmine: {
        // you can add configuration options for Jasmine here
        // the possible options are listed at https://jasmine.github.io/api/edge/Configuration.html
        // for example, you can disable the random execution order
        // random: false
      },
      clearContext: false, // leave Jasmine Spec Runner output visible in browser
    },
    jasmineHtmlReporter: {
      suppressAll: true, // removes the duplicated traces
    },
    coverageReporter: {
      dir: require('path').join(__dirname, './coverage/'),
      subdir: '.',
      reporters: [{ type: 'html' }, { type: 'text-summary' }, { type: 'lcov' }],
    },
    reporters: ['progress', 'kjhtml', 'coverage'],
    browsers: [selectedBrowser],
    restartOnFileChange: true,
    customLaunchers: {
      ChromeHeadlessNoSandbox: {
        base: 'ChromeHeadless',
        flags: [
          '--headless=new', // Modern headless mode
          '--no-sandbox', // Required for running in Docker/CI as root
          '--disable-gpu',
          '--disable-dev-shm-usage', // Overcome limited resource problems
          '--disable-setuid-sandbox', // Disable setuid sandbox
          '--disable-software-rasterizer',
          '--disable-extensions',
          '--remote-debugging-port=0',
        ],
      },
    },
    // Fallback configuration for when browsers aren't available
    failOnEmptyTestSuite: false,
    singleRun: true,
  });
};
