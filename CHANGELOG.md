# Changelog

## [1.1.0](https://github.com/sandovaldavid/octobot/compare/v1.0.0...v1.1.0) (2026-08-15)


### Features

* **ci:** deliver GitHub Actions workflow failure and recovery alerts ([f2405d9](https://github.com/sandovaldavid/octobot/commit/f2405d9995a3a6e5c1059b0e43afea110851f4dd))
* **ci:** deliver GitHub Actions workflow failure and recovery alerts ([56526e4](https://github.com/sandovaldavid/octobot/commit/56526e42027607fd98682f77a792b4d9f6c01d30))
* **notifications:** deliver actionable pull-request and review notifications ([6ec1155](https://github.com/sandovaldavid/octobot/commit/6ec1155ca37835dbde519370b42390c4c2c9f07a))
* **notifications:** deliver actionable pull-request and review notifications ([a0854b5](https://github.com/sandovaldavid/octobot/commit/a0854b52d4c7a8367e357b7230b471c4672a0182))
* **webhook:** add delivery deduplication and idempotency with X-GitHub-Delivery ([b123ff4](https://github.com/sandovaldavid/octobot/commit/b123ff46c304635eb3b0337db04dd1f4134f9ab0))
* **webhook:** add delivery deduplication and idempotency with X-GitHub-Delivery ([2f9e93b](https://github.com/sandovaldavid/octobot/commit/2f9e93bfb3da3fc2c98d6ca4d992d030f5b1a530))


### Code Refactoring

* **api:** make public runtime surface testable ([a877688](https://github.com/sandovaldavid/octobot/commit/a8776883bc72b11513a82d6bdb7b0607ef8da4fc))
* **commands:** align repo commands ([#5](https://github.com/sandovaldavid/octobot/issues/5)) ([c9c2d6c](https://github.com/sandovaldavid/octobot/commit/c9c2d6ccc30f781e0967f3c57d7dc03eeafadd26))
* **persistence:** remove github mirroring and persist only subscriptions ([c7960c7](https://github.com/sandovaldavid/octobot/commit/c7960c7f69017770660e621c7df62adead0954a5))
* **persistence:** remove github mirroring and persist only subscriptions ([3aa2aa8](https://github.com/sandovaldavid/octobot/commit/3aa2aa89b7835a054fc19d4ea352933c29bbea8f))
* **pipeline:** introduce verified typed event-processing pipeline ([1e23b6b](https://github.com/sandovaldavid/octobot/commit/1e23b6b5ced6b300bd54d6aedd0968b857474693))
* **pipeline:** introduce verified typed event-processing pipeline ([4a86098](https://github.com/sandovaldavid/octobot/commit/4a86098ce627372bc70b8f802e0492e8e62efc4d))
* **pipeline:** tighten normalization, event taxonomy, and canonical routing ([dd0e1b3](https://github.com/sandovaldavid/octobot/commit/dd0e1b325667ad5ccb51aa1cdb9836fc9b750087))
* **pipeline:** tighten normalization, event taxonomy, and canonical routing ([3902feb](https://github.com/sandovaldavid/octobot/commit/3902febac9a36c73cf3a4bbc03c104d3063a6f1a))
* **webhooks:** remove public repository configuration path ([1855d86](https://github.com/sandovaldavid/octobot/commit/1855d86b1ac7fcac1692a2a82faf2c3731f6bc4c))
* **webhooks:** remove unreachable admin handlers ([3ced1bd](https://github.com/sandovaldavid/octobot/commit/3ced1bd784c591fa003d7c2258eb298a0e314ebd))


### Security Hardening

* **api:** remove public repository router ([5d40151](https://github.com/sandovaldavid/octobot/commit/5d4015135b243c5a04c15dfafefa1d71cf1ffc19))
* **api:** remove repository REST controller ([eeb5ab1](https://github.com/sandovaldavid/octobot/commit/eeb5ab18493bd4d833f558356eb0a375e22c0abc))
* **api:** remove repository REST surface from runtime ([d3034d2](https://github.com/sandovaldavid/octobot/commit/d3034d28e21514708d08db97e3a0dfe98b732c9b))
* **github:** remove generic repository mutation capabilities ([e3a59d2](https://github.com/sandovaldavid/octobot/commit/e3a59d2915bbd76613e71680d77560315468dea2))
* **webhooks:** remove public admin and test endpoints ([dc2df3c](https://github.com/sandovaldavid/octobot/commit/dc2df3cc754a9c9b82c696114c0bead8ab1c414c))


### Operations & Deployment

* harden production deployment and prepare V1 pilot ([23f0f54](https://github.com/sandovaldavid/octobot/commit/23f0f54d00782303fc111213b78855c32ffe66aa))


### Continuous Integration

* enforce GitHub Actions validation workflow ([5abc883](https://github.com/sandovaldavid/octobot/commit/5abc8838f378d2fd0563f6cbf0006fec3dfed09a))
* enforce GitHub Actions validation workflow ([7a8c1a0](https://github.com/sandovaldavid/octobot/commit/7a8c1a0084cf983fb2cc8f54eda59ccaf7830a9e))
* **release:** configure release-please for automated semver releases ([1973b38](https://github.com/sandovaldavid/octobot/commit/1973b385e6d3726e85ea6bf427559b318e5e3533))
* **release:** configure release-please for automated semver releases ([507c41d](https://github.com/sandovaldavid/octobot/commit/507c41da7fdd52e7ce1e7fd32d91c97fe94560ee))
* **release:** format release-please workflow file ([c056b43](https://github.com/sandovaldavid/octobot/commit/c056b43d5dd34f1c469405e4e2d1dbbe9d837df5))
* **release:** pin release-please-action to verified v4.1.4 commit SHA ([bafa737](https://github.com/sandovaldavid/octobot/commit/bafa73791112fe2af57f7fee323cb52cec172969))
* **release:** pin release-please-action to verified v4.1.4 commit SHA ([4f23a7d](https://github.com/sandovaldavid/octobot/commit/4f23a7dd3f12e2d3bf419bb4f31fed3a6fc6fadb))
* **release:** promote release-please automation to main ([b9fea7e](https://github.com/sandovaldavid/octobot/commit/b9fea7e6cab46a0aa9dfcc95d9ba64c8497f9666))
* **release:** promote release-please automation to main ([9fe784f](https://github.com/sandovaldavid/octobot/commit/9fe784fa3a3dd6c773d09f529216aea28d672816))


### Documentation

* format README with prettier ([5b3ec33](https://github.com/sandovaldavid/octobot/commit/5b3ec338b78be4fe753f0e437ec5003c778abc6e))
* **security:** document reduced public API and permissions ([51f48b7](https://github.com/sandovaldavid/octobot/commit/51f48b79f7e483804c4922690b9ae1f8f9a5b1e5))
