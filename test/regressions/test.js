// @flow weak
const path = require('path');
const glob = require('glob');
const pngCrop = require('png-crop');
const BlinkDiff = require('blink-diff');

module.exports = glob.sync(path.resolve(__dirname, 'site/src/tests/**/*.js'))
  .reduce(reduceTests, {
    beforeEach(browser) {
      browser
        .setWindowPosition(0, 0)
        .resizeWindow(1200, 1000);
    },
    after(browser) {
      browser.end();
    },
  });

function reduceTests(res, n) {
  const testPath = n.replace(/^.*?tests\/(.*).js$/i, '$1');
  res[testPath] = createTest(testPath);
  return res;
}

function createTest(testPath) {
  return function regressions(browser) {
    browser
      .url(`${browser.launch_url}/#/${testPath}`)
      .waitForElementVisible('[data-reactroot]', 6000)
      .perform(performRegressionTest);

    function performRegressionTest(client, done) {
      client.session(({ value }) => {
        const profile = `${value.browserName.toLowerCase()}-${value.version}-${value.platform.toLowerCase()}`;
        const screenshotPath = path.resolve(__dirname, `screenshots/output/${testPath}/${profile}.png`);
        const baselinePath = path.resolve(__dirname, `screenshots/baseline/${testPath}/${profile}.png`);
        client.windowHandle((handle) => {
          client.windowSize(handle.value, (size) => {
            return screenshotElement(
              client,
              screenshotPath,
              size.value,
              () => compareScreenshots(client, baselinePath, screenshotPath, done)
            );
          });
        });
      });
    }

    function compareScreenshots(client, baselinePath, screenshotPath, done) {
      const diff = new BlinkDiff({
        imageAPath: baselinePath,
        imageBPath: screenshotPath,
        thresholdType: BlinkDiff.THRESHOLD_PERCENT,
        threshold: 0.01,
        composition: false,
        hideShift: true,
        hShift: 2,
        vShift: 2,
        imageOutputPath: screenshotPath.replace('.png', '-diff.png'),
      });

      diff.run((error, result) => {
        if (error) {
          throw error;
        } else {
          // console.log(diff.hasPassed(result.code) ? 'Passed' : 'Failed');
          client.assert.strictEqual(result.differences, 0, `should have 0 differences, found ${result.differences}.`);
          done();
        }
      });
    }

    function screenshotElement(client, screenshotPath, windowSize, done) {
      client.element('css selector', '[data-reactroot] > *:first-child', (element) => {
        client.elementIdLocationInView(element.value.ELEMENT, (location) => {
          client.elementIdSize(element.value.ELEMENT, (size) => {
            client.saveScreenshot(screenshotPath, () => {
              const cropWidth = size.value.width < windowSize.width - 30;
              const cropHeight = size.value.height < windowSize.height - 30;

              if (cropWidth || cropHeight) {
                const config = {
                  width: cropWidth ? size.value.width + 30 : windowSize.width,
                  height: cropHeight ? size.value.height + 30 : windowSize.height,
                  top: cropHeight && location.value.y >= 15 ? location.value.y - 15 : location.value.y,
                  left: cropWidth && location.value.x >= 15 ? location.value.x - 15 : location.value.x,
                };
                pngCrop.crop(screenshotPath, screenshotPath, config, (err) => {
                  if (err) throw err;
                  done();
                });
              } else {
                done();
              }
            });
          });
        });
      });
    }
  };
}
