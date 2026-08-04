<template>
  <img
    src="/banner.png"
    alt="Showing Ai"
    class="banner-brand"
    :class="{ 'banner-brand--faded': faded }"
    :style="{ maxWidth }"
  />
</template>

<script setup lang="ts">
interface BannerBrandProps {
  faded?: boolean
  maxWidth?: string
}

withDefaults(defineProps<BannerBrandProps>(), {
  faded: false,
  maxWidth: '100%',
})
</script>

<style scoped>
.banner-brand {
  width: 100%;
  height: auto;
  display: block;
  border-radius: 8px;
}

.banner-brand--faded {
  opacity: 0.5;
}
</style>
