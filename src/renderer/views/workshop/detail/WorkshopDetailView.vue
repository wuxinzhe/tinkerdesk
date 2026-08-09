<template>
  <div class="workshop-detail">
    <div class="workshop-detail__body">
      <div class="workshop-placeholder">
        <div class="workshop-placeholder__inner">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/>
            <circle cx="9" cy="7" r="4"/>
            <path d="M23 21v-2a4 4 0 00-3-3.87"/>
            <path d="M16 3.13a4 4 0 010 7.75"/>
          </svg>
          <h3>工坊</h3>
          <p>即将推出</p>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
</script>

<style scoped>
.workshop-detail {
  display: flex;
  flex-direction: center;
  height: 100%;
  min-height: 0;
}
.workshop-detail__body {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 0;
}
.workshop-placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 0;
}
.workshop-placeholder__inner {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  color: var(--tk-text-tertiary);
}
.workshop-placeholder__inner h3 {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: var(--tk-text-secondary);
}
.workshop-placeholder__inner p {
  margin: 0;
  font-size: 13px;
}
</style>
