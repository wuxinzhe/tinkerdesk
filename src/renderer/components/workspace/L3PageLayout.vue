<template>
  <div class="l3-page-layout">
    <slot />
  </div>
</template>

<style scoped>
.l3-page-layout {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 20px 24px;
  container-type: inline-size;
  container-name: l3-content;
}
</style>
