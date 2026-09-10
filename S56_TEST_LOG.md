# S56 TEST LOG — SameDayDesk

## Merchant sibling
```bash
export MERCHANT_INPUT_ROOT=/path/to/x402-url-extractor@S56-tip   # package name x402-merchant + npm ci
# or place checkout at ../x402-url-extractor / vendor/x402-url-extractor
```

## Commands
```bash
npm install --ignore-scripts
npm --prefix client install --ignore-scripts
npm run test:recurring-job-recipes
npm run test:public-entry
npm run test:presence
npm run test:result-reuse
npm run build
npm run test:browser-desktop
npm run test:browser-mobile
```

## Result
All of the above exited 0 on composition tip. Recipe suite 81/81 after latent prior-test alignment.
