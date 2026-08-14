// 测试插件：依赖 lodash——验证安装时自动 npm install
const _ = require('lodash')

module.exports = {
  init(ctx) {
    ctx.registerIpc('test:ping', async () => ({ lodash: _.VERSION }))
    return {
      check() {
        return { ok: true, checks: [{ name: 'lodash', ok: typeof _.VERSION === 'string', hint: `lodash@${_.VERSION}` }] }
      },
    }
  },
}
