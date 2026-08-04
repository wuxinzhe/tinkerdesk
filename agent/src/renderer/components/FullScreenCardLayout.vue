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
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
  min-height: 100dvh;
  background: var(--sa-bg-primary);
  width: 100%;
}

.layout-card__container {
  width: 100%;
  max-width: 420px;
  padding: 48px 32px 32px;
  text-align: center;
}

.layout-card__brand {
  margin-bottom: 32px;
}

.layout-card__heading {
  font-size: var(--sa-fs-hero);
  font-weight: 700;
  color: var(--sa-text-primary);
  margin: 0 0 6px;
  letter-spacing: -0.5px;
}

.layout-card__subtitle {
  font-size: var(--sa-fs-subtitle);
  color: var(--sa-text-secondary);
  margin: 0 0 32px;
}

.layout-card__form {
  text-align: left;
}

.layout-card__footer {
  margin-top: 24px;
  text-align: center;
  font-size: var(--sa-fs-body);
  color: var(--sa-text-secondary);
}
</style>
