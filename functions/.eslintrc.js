module.exports = {
  env: {
    es6: true,
    node: true,
    jest: true,
  },
  extends: [
    'eslint:recommended',
  ],
  rules: {
    'no-unused-vars': 'off',
    'indent': 'off',
    'quotes': 'off',
    'semi': 'off',
    'max-len': 'off',
    'comma-dangle': 'off',
    'object-curly-spacing': 'off',
    'trailing-spaces': 'off',
    'no-trailing-spaces': 'off',
    'operator-linebreak': 'off',
    'require-jsdoc': 'off',
    'valid-jsdoc': 'off',
    'no-multi-spaces': 'off',
    'arrow-parens': 'off',
    'new-cap': 'off',
  },
  parserOptions: {
    ecmaVersion: 2022,
  },
};
