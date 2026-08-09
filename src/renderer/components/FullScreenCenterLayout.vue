<template>
  <div class="layout-center">
    <div class="layout-center__content">
      <slot />
    </div>
    <p v-if="showVersion" class="layout-center__version">
      {{ versionText }}
    </p>
  </div>
</template>

<script setup lang="ts">
interface FullScreenCenterLayoutProps {
  showVersion?: boolean
  versionText?: string
}

withDefaults(defineProps<FullScreenCenterLayoutProps>(), {
  showVersion: false,
  versionText: '',
})
</script>

<style scoped>
.layout-center {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
  min-height: 100dvh;
  background: var(--tk-bg-primary);
  width: 100%;
  position: relative;
}

.layout-center__content {
  text-align: center;
}

.layout-center__version {
  position: fixed;
  bottom: 24px;
  left: 0;
  right: 0;
  text-align: center;
  font-size: var(--tk-fs-caption);
  color: var(--tk-text-quaternary);
  margin: 0;
}
</style>
