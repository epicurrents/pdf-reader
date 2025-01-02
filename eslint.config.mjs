import eslint from '@eslint/js'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  eslint.configs.recommended,
  {
    rules: {
      quotes: [2, "single"]
    },
  },
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        allowDefaultProject: ['/*.js'],
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
)