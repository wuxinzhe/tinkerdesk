<template>
  <div class="layout-card">
    <div class="layout-card__container">
      <!-- Brand -->
      <div class="layout-card__brand">
        <slot name="brand" />
      </div>

      <!-- Heading -->
      <h1 class="layout-card__heading"><slot name="heading" /></h1>

      <!-- Subtitle -->
      <p v-if="$slots.subtitle" class="layout-card__subtitle">
        <slot name="subtitle" />
      </p>

      <!-- Form -->
      <div class="layout-card__form">
        <slot name="form" />
      </div>

      <!-- Footer -->
      <div v-if="$slots.footer" class="layout-card__footer">
        <slot name="footer" />
      </div>
    </div>
  </div>
</template>

<style scoped>
.layout-card {
  position: relative;
  isolation: isolate;
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
  min-height: 100dvh;
  background: var(--tk-bg-primary);
  width: 100%;
}

/* ── 科技感背景层（Splash 风格：极淡网格 + 蓝青光晕） ── */

/* 网格：48px 细线 + 径向渐隐（中央可见，不抢表单） */
.layout-card::before {
  content: '';
  position: absolute;
  inset: 0;
  z-index: -1;
  pointer-events: none;
  background-image:
    linear-gradient(rgba(0, 0, 0, 0.025) 1px, transparent 1px),
    linear-gradient(90deg, rgba(0, 0, 0, 0.025) 1px, transparent 1px);
  background-size: 48px 48px;
  mask-image: radial-gradient(ellipse 70% 60% at 50% 40%, black 25%, transparent 100%);
  -webkit-mask-image: radial-gradient(ellipse 70% 60% at 50% 40%, black 25%, transparent 100%);
}

/* 光晕：左上蓝 + 右下青（低透明度，blur 柔和） */
.layout-card::after {
  content: '';
  position: absolute;
  inset: 0;
  z-index: -1;
  pointer-events: none;
  background:
    radial-gradient(circle at 12% 8%, rgba(0, 122, 255, 0.12), transparent 42%),
    radial-gradient(circle at 88% 92%, rgba(48, 173, 179, 0.1), transparent 42%);
  filter: blur(64px);
}

.layout-card__container {
  width: 100%;
  max-width: 420px;
  max-height: 100vh;
  max-height: 100dvh;
  padding: 40px 32px 24px;
  text-align: center;
  display: flex;
  flex-direction: column;
}

.layout-card__brand {
  margin-bottom: 24px;
  flex-shrink: 0;
}

.layout-card__heading {
  font-size: var(--tk-fs-hero);
  font-weight: 700;
  color: var(--tk-text-primary);
  margin: 0 0 6px;
  letter-spacing: -0.5px;
  flex-shrink: 0;
}

.layout-card__subtitle {
  font-size: var(--tk-fs-subtitle);
  color: var(--tk-text-secondary);
  margin: 0 0 20px;
  flex-shrink: 0;
}

/* 表单区：视口内弹性收缩，超出可滚动（隐藏滚动条） */
.layout-card__form {
  text-align: left;
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
  scrollbar-width: none;
  -ms-overflow-style: none;
}

.layout-card__form::-webkit-scrollbar {
  display: none;
}

.layout-card__footer {
  margin-top: 16px;
  text-align: center;
  font-size: var(--tk-fs-body);
  color: var(--tk-text-secondary);
  flex-shrink: 0;
}
</style>
