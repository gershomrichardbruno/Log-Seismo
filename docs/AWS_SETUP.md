# AWS setup, step by step (first time)

About **30 minutes**. You need an AWS account; a friend's is fine. Everything stays within the free tier.

We use three AWS services, all in region **Asia Pacific (Mumbai), `ap-south-1`**:

| Service | What it's for |
|---|---|
| **SNS** (Simple Notification Service) | Emails a person when a HIGH or CRITICAL alert fires |
| **CloudWatch Logs** | Stores every alert. Created automatically; nothing to click |
| **IAM** (Identity and Access Management) | A limited login key for our app, so nobody shares the account password |

> **Account owner:** do steps 1–3 yourself and send only the **topic ARN**, the **access key ID** and the **secret access key** (step 3). Never share your root password. Delete the key after the demo (step 6).

---

## Step 1: Sign in and pick the region
1. Go to https://console.aws.amazon.com/ and sign in.
2. In the top-right corner, click the region name and choose **Asia Pacific (Mumbai) ap-south-1**. Every step below must happen in this region.

## Step 2: Create the SNS topic and subscribe an email
1. Open SNS topics: https://ap-south-1.console.aws.amazon.com/sns/v3/home?region=ap-south-1#/topics
2. Click **Create topic**.
   - Type: **Standard**
   - Name: `log-seismo-alerts`
   - Click **Create topic** at the bottom.
3. On the topic page, **copy the ARN**. It looks like `arn:aws:sns:ap-south-1:123456789012:log-seismo-alerts`.
4. Click **Create subscription**.
   - Protocol: **Email**
   - Endpoint: the email address that should receive alerts, e.g. the team phone's email
   - Click **Create subscription**.
5. Open that inbox and click **Confirm subscription** in the email from AWS. Check spam. Until you click it, no alert emails arrive.

## Step 3: Create a limited IAM user and access key
1. Open IAM users: https://console.aws.amazon.com/iam/home#/users
2. Click **Create user**. User name: `log-seismo`. Leave "Provide user access to the AWS Management Console" **unticked**. Click **Next**.
3. Choose **Attach policies directly**, then click **Create policy**. This opens a new tab.
   - Click the **JSON** tab, delete what's there and paste:
     ```json
     {
       "Version": "2012-10-17",
       "Statement": [
         { "Effect": "Allow",
           "Action": ["logs:CreateLogGroup", "logs:CreateLogStream", "logs:PutLogEvents"],
           "Resource": "arn:aws:logs:ap-south-1:*:log-group:/log-anomaly-detector/*" },
         { "Effect": "Allow",
           "Action": "sns:Publish",
           "Resource": "arn:aws:sns:ap-south-1:*:log-seismo-alerts" }
       ]
     }
     ```
   - Click **Next**. Name it `log-seismo-policy`, then **Create policy**.
4. Back in the first tab, click the refresh button, search `log-seismo-policy`, tick it, then **Next** → **Create user**.
5. Open the user `log-seismo` → **Security credentials** tab → **Create access key**.
   - Use case: **Application running outside AWS** → **Next** → **Create access key**.
   - Copy the **Access key ID** and **Secret access key** now. The secret is shown only once. You can also click **Download .csv file**.

Official help pages, if you get stuck:
- Creating an SNS topic: https://docs.aws.amazon.com/sns/latest/dg/sns-create-topic.html
- Email subscriptions: https://docs.aws.amazon.com/sns/latest/dg/sns-email-notifications.html
- Access keys for IAM users: https://docs.aws.amazon.com/IAM/latest/UserGuide/id_credentials_access-keys.html

## Step 4: Put the values in `.env`
In the project folder (copy `.env.example` to `.env` if you haven't), set:
```
AWS_ENABLED=true
AWS_REGION=ap-south-1
SNS_TOPIC_ARN=arn:aws:sns:ap-south-1:123456789012:log-seismo-alerts
AWS_ACCESS_KEY_ID=AKIA................
AWS_SECRET_ACCESS_KEY=........................................
```
No quotes, no spaces. `.env` is in `.gitignore`. **Never commit it, paste it in chat, or put it on a slide.** No AWS CLI install is needed; the app reads the keys from `.env`.

## Step 5: Test it
```bash
python -m scripts.aws_check
```
You should see three `[ok]` lines, and a test email arrives. Then run the app as usual. On the dashboard, the top bar pill changes from **AWS off** to **CloudWatch + SNS**.

To see alerts in CloudWatch, open https://ap-south-1.console.aws.amazon.com/cloudwatch/home?region=ap-south-1#logsV2:log-groups, then `/log-anomaly-detector/alerts` → `alerts`. Take a screenshot for the slides.

## Step 6: After the demo
- IAM → Users → `log-seismo` → **Delete**. This kills the key.
- Optionally, SNS → Topics → `log-seismo-alerts` → **Delete**, and CloudWatch → Log groups → delete `/log-anomaly-detector/alerts`.

## Troubleshooting
| Symptom | Fix |
|---|---|
| `[fail] credentials rejected` | Keys mistyped, or have spaces or quotes. Re-copy them from the .csv |
| `AccessDenied` on SNS | Topic name or region differs from the policy (`log-seismo-alerts`, `ap-south-1`) |
| No email | Subscription not confirmed (step 2.5), or the mail went to spam. Only HIGH and CRITICAL alerts are emailed |
| `NotFound` on topic | The ARN was pasted from another region; recreate the topic in Mumbai |
