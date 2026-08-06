<template>
  <img
    src="/logo.png"
    alt="Showing Ai"
    class="logo-brand"
    :class="{ 'logo-brand--faded': faded }"
    :style="{ maxWidth }"
  />
</template>

<script setup lang="ts">
interface LogoBrandProps {
  faded?: boolean
  maxWidth?: string
}

withDefaults(defineProps<LogoBrandProps>(), {
  faded: false,
  maxWidth: '140px',
})
</script>

<style scoped>
.logo-brand {
  width: 100%;
  height: auto;
  display: block;
  border-radius: 8px;
}

.logo-brand--faded {
  opacity: 0.5;
}
</style>
