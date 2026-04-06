# @alicization/rpg-advanced — License Key 生成指南
#
# 1. 安装依赖:  npm install
# 2. 生成 key:
#
#    node -e "
#      const { generateKey } = require('./src/license');
#      const key = generateKey({
#        sub: 'user-email@example.com',
#        plan: 'pro',
#        exp: Date.now() + 365 * 24 * 60 * 60 * 1000  // 1年有效期
#      });
#      console.log(key);
#    "
#
# 3. 构建混淆版: npm run build
# 4. 发布:       npm publish
#
# 用户使用:
#   ALICIZATION_RPG_LICENSE=<key> ALICIZATION_PLUGINS=@alicization/rpg-advanced npm start
