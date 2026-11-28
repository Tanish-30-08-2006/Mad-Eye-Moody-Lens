# Mad-Eye Moody Lens Documentation Index

Welcome to the documentation repository for **Mad-Eye Moody Lens**, an automated multi-modal digital forensics and deepfake detection platform developed for the **DA-IICT IT314 Software Engineering** course.

---

## Documentation Structure

```
docs/
├── README.md                                 # Documentation index and overview (this file)
└── system-design/
    └── system-design-document.md             # Comprehensive System Design Document
```

---

## Document Summaries

### [System Design Document](system-design/system-design-document.md)
* **File:** [`docs/system-design/system-design-document.md`](system-design/system-design-document.md)
* **Status:** Complete (Engineering Submission)
* **Scope:** Comprehensive architectural documentation of the entire deployed Mad-Eye Moody Lens platform.
* **Key Topics Covered:**
  1. **Introduction:** Problem statement, scope, and objectives.
  2. **System Overview:** Functional capabilities, primary user personas, and client interfaces.
  3. **Architectural Style:** Client-server, modular monolith, asynchronous queues, and hybrid compute partitioning.
  4. **Subsystem Decomposition:** Decomposition of the 8 major subsystems.
  5. **Layered Design:** Mapping components from presentation down to persistence.
  6. **Module Design and Responsibilities:** Core modules, workflows, and inter-module communication.
  7. **Cohesion and Coupling:** Concrete design patterns and isolation strategies.
  8. **Information Hiding and Interfaces:** Encapsulation of deep learning internals and API contracts.
  9. **Data and Object Design:** Relational database schemas, ephemeral storage, and Redis data structures.
  10. **Design Decisions and Trade-offs:** Detailed analysis of engineering decisions and hardware constraints.
  11. **Known Limitations and Incomplete Functionality:** Transparent accounting of pending work and known operational constraints.

---

## Architectural Principles at a Glance

* **Pretrained Models Only:** The platform uses validated open-source pretrained models (Swin Transformer, EfficientNet-B0, and Wav2Vec2) without custom training.
* **Zero Storage of User Media:** Uploaded images, audio files, video frames, client IPs, and EXIF metadata are never permanently stored, logged, or exposed.
* **Strict Memory & CPU Isolation:** Celery workers run with `--concurrency=1` under dedicated memory caps to operate reliably on constrained CPU environments (8 GB RAM laptop or free-tier cloud containers).
* **Decoupled API & Inference:** The web API process never loads machine learning frameworks into memory, ensuring high responsiveness and resilience against worker restarts.
* **Client-Side Forensics:** Utilities such as SHA-256 fingerprinting and EXIF metadata inspection run entirely within the user's browser via Web Crypto and local parsers, ensuring absolute user data privacy.
