import js from '@eslint/js'
import pluginVue from 'eslint-plugin-vue'
import tseslint from 'typescript-eslint'
import vueTsEslintConfig from '@vue/eslint-config-typescript'

export default [
  { ignores: ['node_modules', 'out', 'dist', 'screenshots', 'scripts'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...pluginVue.configs['flat/recommended'],
  ...vueTsEslintConfig(),
  {
    files: ['**/*.vue', '**/*.ts'],
    rules: {
      // 格式噪音：SVG/组件属性单行风格（项目惯例）
      'vue/max-attributes-per-line': 'off',
      'vue/html-closing-bracket-spacing': 'off',
      'vue/html-self-closing': 'off',
      'vue/multi-word-component-names': 'off',
      // v-html 用于 SVG 图标注入（受控内容）
      'vue/no-v-html': 'off',
      // 未使用变量：_ 前缀豁免（保留接口签名/占位）
      '@typescript-eslint/no-unused-vars': ['error', {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        caughtErrorsIgnorePattern: '^_',
        ignoreRestSiblings: true
      }],
      // props 就地修改（项目既有模式——select/expand 状态更新）
      'vue/no-mutating-props': 'off',
      // 显式 any（既有代码较多——逐步收敛）
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-require-imports': 'off',
      // 初始值用于空分支路径（tsc strict 与 eslint 分析冲突——误报）
      'no-useless-assignment': 'off',
      // props 默认值规则（必填 props 无需默认值——项目风格）
      'vue/require-default-prop': 'off',
      'vue/no-required-prop-with-default': 'off',
      'vue/require-explicit-emits': 'off'
    }
  }
]
