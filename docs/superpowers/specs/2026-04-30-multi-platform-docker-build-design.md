# Spec: Multi-Platform Docker Build Support

**Date:** 2026-04-30
**Topic:** Multi-Platform Docker Build (AMD64 & ARM64) with GHA Caching

## 1. Purpose
Enable Docker image support for both traditional servers (AMD64) and modern ARM-based systems (Apple Silicon, AWS Graviton, Raspberry Pi). Optimize build performance using GitHub Actions caching to mitigate emulation overhead.

## 2. Architecture & Design

### 2.1 Tooling
- **Docker Buildx**: Extended Docker tool for building multi-platform images.
- **QEMU**: Emulator to allow building ARM64 images on AMD64 runners.
- **GitHub Actions Cache (gha)**: Dedicated caching backend to persist Docker layers across workflow runs.

### 2.2 Workflow Logic (GitHub Actions)
1. **Setup**:
   - Initialize QEMU via `docker/setup-qemu-action`.
   - Initialize Buildx via `docker/setup-buildx-action`.
2. **Build Configuration**:
   - Platforms: `linux/amd64`, `linux/arm64`.
   - Caching Strategy: Use `type=gha` for both import and export.
   - Cache Mode: `max` (cache all intermediate layers, not just the final image).

### 2.3 Success Criteria
- A single Docker tag (e.g., `:dev` or `:latest`) contains manifests for both `amd64` and `arm64`.
- CI successfully completes within a reasonable timeframe (optimized by cache).
- Image can be pulled and run on both Mac M-series and standard Linux x86_64 servers.

## 3. Implementation Details

### 3.1 .github/workflows/ci.yml
- Add `docker/setup-qemu-action` step.
- Add `docker/setup-buildx-action` step.
- Update `docker/build-push-action` parameters:
  ```yaml
  platforms: linux/amd64,linux/arm64
  cache-from: type=gha
  cache-to: type=gha,mode=max
  ```

## 4. Verification Plan
- Monitor first build to ensure multi-platform manifest is created.
- Verify manifest via `docker buildx imagetools inspect <image_tag>`.
- Check subsequent builds to confirm cache hits.
