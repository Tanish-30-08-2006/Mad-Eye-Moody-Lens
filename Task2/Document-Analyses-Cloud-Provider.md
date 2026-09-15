**Cloud Provider:**
Amazon Web Services (AWS)

**Source / Document:**
*   [Amazon S3 User Guide / Developer Guide](https://docs.aws.amazon.com/AmazonS3/latest/userguide/Welcome.html)
*   [AWS Lambda Developer Guide](https://docs.aws.amazon.com/lambda/latest/dg/welcome.html)
*   [Amazon SageMaker Developer Guide (Real-Time & Asynchronous Inference)](https://docs.aws.amazon.com/sagemaker/latest/dg/deploy-model.html)
*   [AWS Free Tier Details](https://aws.amazon.com/free/)

---

### Key Findings

#### 1. Storage (Amazon S3)
*   **Capabilities:** Amazon S3 supports storing any file type (images, videos, audio) as objects. Individual object sizes can range from 0 bytes up to 5 TB.
*   **Limits & Restrictions:** There is no limit to the total volume of data or number of objects stored in a bucket. However, a single `PutObject` upload request cannot exceed 5 GB. For files larger than 100 MB, AWS recommends using multipart uploads.
*   **Retention:** S3 offers Lifecycle policies to transition objects to cheaper storage classes or delete them automatically after a specified number of days.

#### 2. Compute / Model Inference (Amazon SageMaker & AWS Lambda)
*   **Capabilities:** 
    *   **AWS Lambda:** Serverless compute suitable for lightweight orchestration, API routing, and small image preprocessing.
    *   **Amazon SageMaker:** Purpose-built for hosting machine learning models. It supports CPU and GPU instances (e.g., `ml.g4dn` instances for GPU-accelerated deep learning inference).
*   **Limits & Restrictions:**
    *   **AWS Lambda:** Maximum execution timeout is 15 minutes (900 seconds). Ephemeral storage (`/tmp` directory) is limited to 10 GB. Maximum deployment package size is 250 MB (unzipped) or 10 GB for container images.
    *   **SageMaker Real-Time Inference:** Maximum payload size for synchronous requests is 6 MB. Response timeout is capped at 60seconds.
    *   **SageMaker Asynchronous Inference:** Designed for larger payloads (up to 1 GB) and long-running processing times (up to 1hour). It queues incoming requests using Amazon SQS.

#### 3. Scalability
*   **Capabilities:** 
    *   **S3:** Automatically scales to handle high request rates (at least 3,500 `PUT/COPY/POST/DELETE` and 5,500 `GET/HEAD` requests per second per prefix).
    *   **Lambda:** Scales horizontally by creating new instances of the function. The default regional concurrency limit is 1,000concurrent executions.
    *   **SageMaker:** Supports Auto Scaling, which dynamically adjusts the number of active model instances based on workload metrics (e.g., `InvocationsPerInstance`).

#### 4. Performance
*   **Factors Affecting Response Time:**
    *   **Cold Starts:** AWS Lambda and SageMaker Serverless Inference experience "cold starts" (latency spikes when a new container is initialized to handle a request after a period of inactivity).
    *   **Payload Size:** Transferring large video files over the network to S3 and then to SageMaker endpoints increases latency.
    *   **Hardware Selection:** CPU-based inference is significantly slower than GPU-based inference for deep learning models (e.g., CNNs, ViTs used in deepfake detection).
*   **Service Limits:** The 60-second timeout limit on SageMaker Real-Time endpoints means any video analysis taking longer than 1minute will fail unless Asynchronous Inference is used.

#### 5. Cost / Usage Limits (AWS Free Tier)
*   **S3:** 5 GB of Standard Storage, 20,000 GET Requests, and 2,000 PUT Requests per month for the first 12 months.
*   **Lambda:** 1 million free requests per month and 400,000 GB-seconds of compute time per month (always free).
*   **SageMaker:** Free tier includes 250 hours of `m5.large` on Jupyter notebooks, 50 hours of `m5.xlarge` for training, and 125 hours of `m5.xlarge` or `t2.medium` for real-time hosting per month for the first 2 months. *Note: GPU instances (like `g4dn`) are not included in the free tier.*

#### 6. Security and Privacy
*   **Capabilities:**
    *   **Encryption:** S3 automatically applies Server-Side Encryption (SSE-S3) using 256-bit AES to all new objects by default. Data in transit is secured using TLS (HTTPS).
    *   **Access Control:** S3 Block Public Access is enabled by default. AWS Identity and Access Management (IAM) roles restrict access to media files so only the backend compute resources can read them.

#### 7. Data Deletion
*   **Capabilities:**
    *   **Programmatic Deletion:** Media files can be deleted immediately via the AWS SDK (e.g., `s3.deleteObject()`) as soon as the deepfake detection model finishes processing.
    *   **S3 Lifecycle Policies:** Can be configured to automatically delete objects after a minimum of 1 day. This acts as a safety net to clean up orphaned files if the application crashes before programmatic deletion occurs.

---

### Requirements / Constraints Derived

1.  **Handling Large Media Files (Technical Constraint):**
    *   *Fact:* SageMaker Real-Time endpoints limit payloads to 6 MB.
    *   *Requirement:* The Deepfake Detection Web App **must** use Amazon SageMaker **Asynchronous Inference** (or pre-save files to S3 and pass S3 URIs to the model) for processing video uploads, as video files will frequently exceed the 6 MB synchronous payload limit.

2.  **Asynchronous Processing Architecture (Technical Constraint):**
    *   *Fact:* AWS Lambda has a 15-minute execution limit, and SageMaker Real-Time endpoints have a 60-second timeout.
    *   *Requirement:* The web application **must** implement an asynchronous, event-driven architecture. When a user uploads a video, the system must immediately return a "processing" status and a unique task ID, rather than holding the HTTP connection open while the model runs.

3.  **Data Minimization and Privacy (Domain / Privacy Requirement):**
    *   *Fact:* S3 allows immediate programmatic deletion and automated Lifecycle policies.
    *   *Requirement:* To protect user privacy and minimize storage costs, the application **must** programmatically delete uploaded media from S3 immediately after the inference result is generated. Additionally, an S3 Lifecycle Policy **must** be configured to permanently delete any remaining objects in the upload bucket after 24 hours as a fail-safe.

4.  **Cost Control for Student Project (Technical Constraint / Non-functional):**
    *   *Fact:* GPU instances are excluded from the AWS SageMaker Free Tier, and S3 free storage is capped at 5 GB.
    *   *Requirement:* The application **should** restrict individual user uploads to a maximum of 50 MB per video, and the model **should** be optimized to run on CPU instances (e.g., `ml.m5.xlarge` which is covered under the 2-month free tier) during development and testing to avoid incurring high cloud costs.

5.  **Secure Storage Access (Technical Constraint):**
    *   *Fact:* S3 Block Public Access is enabled by default, and IAM roles restrict access.
    *   *Requirement:* Uploaded media files **must not** be publicly accessible. The frontend web app must upload files using S3 Presigned URLs generated by the backend, ensuring that only authenticated sessions can write to the storage bucket.

---

### Summary Table

| Source / Service | Important Finding | Requirement / Constraint | Type |
| :--- | :--- | :--- | :--- |
| **Amazon SageMaker** | Real-time endpoint payload limit is 6 MB; timeout is 60 seconds. | Use SageMaker Asynchronous Inference or S3 URI passing for video files. | Technical Constraint |
| **AWS Lambda & SageMaker** | Lambda has a 15-minute timeout; SageMaker real-time has a 60-second timeout. | Implement an asynchronous, event-driven architecture with task IDs for video processing. | Technical Constraint |
| **Amazon S3** | Supports programmatic deletion and Lifecycle policies (minimum 1 day). | Programmatically delete media immediately post-inference; set a 24-hour S3 Lifecycle deletion fail-safe. | Domain / Privacy |
| **AWS Free Tier** | S3 free tier is 5 GB; SageMaker free tier excludes GPU instances. | Restrict uploads to 50 MB per file and optimize models to run on free-tier CPU instances (`m5.xlarge`). | Technical Constraint |
| **Amazon S3 / IAM** | Block Public Access is enabled by default; supports Presigned URLs. | Use S3 Presigned URLs for secure, direct-to-S3 client uploads without making the bucket public. | Technical Constraint |

**Confidence:** High
