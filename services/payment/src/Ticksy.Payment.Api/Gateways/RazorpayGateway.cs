// ── Gateways/RazorpayGateway.cs ─────────────────────────────────────────────
// Adapts the raw Razorpay .NET SDK into our domain vocabulary.
// "Gateway" in the DDD sense: it is an anti-corruption layer between our
// domain and the external provider. If we ever swap to Stripe, we only
// change this file.
using Razorpay.Api;
using System.Security.Cryptography;
using System.Text;

namespace Ticksy.Payment.Api.Gateways;

public interface IRazorpayGateway
{
    string KeyId { get; }

    /// <summary>Create a Razorpay Order and return its ID.</summary>
    Task<string> CreateOrderAsync(long amountMinor, string currency, string receiptId);

    /// <summary>
    /// Verify the webhook signature. Razorpay HMAC-SHA256 of "raw body"
    /// with the webhook secret. Throws if invalid.
    /// </summary>
    bool VerifyWebhookSignature(string rawBody, string razorpaySignature);

    /// <summary>Verify the Checkout signature (client-side confirm flow).</summary>
    bool VerifyPaymentSignature(string orderId, string paymentId, string signature);

    /// <summary>Issue a refund against an existing Razorpay payment.</summary>
    Task<string> RefundAsync(string providerPaymentId, long amountMinor);
}

public sealed class RazorpayGateway(IConfiguration config) : IRazorpayGateway
{
    private readonly string _keyId     = config["RAZORPAY_KEY_ID"] ?? config["Razorpay:KeyId"] ?? throw new InvalidOperationException("Razorpay:KeyId or RAZORPAY_KEY_ID is required");
    private readonly string _keySecret = config["RAZORPAY_KEY_SECRET"] ?? config["Razorpay:KeySecret"] ?? throw new InvalidOperationException("Razorpay:KeySecret or RAZORPAY_KEY_SECRET is required");
    private readonly string _webhookSecret = config["RAZORPAY_WEBHOOK_SECRET"] ?? config["Razorpay:WebhookSecret"] ?? throw new InvalidOperationException("Razorpay:WebhookSecret or RAZORPAY_WEBHOOK_SECRET is required");

    public string KeyId => _keyId;

    public Task<string> CreateOrderAsync(long amountMinor, string currency, string receiptId)
    {
        var client = new RazorpayClient(_keyId, _keySecret);
        var options = new Dictionary<string, object>
        {
            { "amount",   amountMinor },   // in paise – Razorpay expects minor units
            { "currency", currency    },
            { "receipt",  receiptId   },
            { "payment_capture", 1    }    // auto-capture on payment
        };
        var order = client.Order.Create(options);
        return Task.FromResult((string)order["id"]);
    }

    public bool VerifyWebhookSignature(string rawBody, string razorpaySignature)
    {
        if (string.IsNullOrWhiteSpace(razorpaySignature))
            return false;

        // Razorpay webhook verification:
        // HMAC_SHA256(rawBody, webhookSecret) == razorpaySignature (hex encoded)
        var keyBytes  = Encoding.UTF8.GetBytes(_webhookSecret);
        var bodyBytes = Encoding.UTF8.GetBytes(rawBody);
        var computed  = HMACSHA256.HashData(keyBytes, bodyBytes);
        var hex       = Convert.ToHexString(computed).ToLowerInvariant();

        return CryptographicOperations.FixedTimeEquals(
            Encoding.ASCII.GetBytes(hex),
            Encoding.ASCII.GetBytes(razorpaySignature.ToLowerInvariant()));
    }

    public bool VerifyPaymentSignature(string orderId, string paymentId, string signature)
    {
        // Razorpay payment.captured signature = HMAC_SHA256(orderId|"|"|paymentId, keySecret)
        var message   = $"{orderId}|{paymentId}";
        var keyBytes  = Encoding.UTF8.GetBytes(_keySecret);
        var msgBytes  = Encoding.UTF8.GetBytes(message);
        var computed  = HMACSHA256.HashData(keyBytes, msgBytes);
        var hex       = Convert.ToHexString(computed).ToLowerInvariant();
        return CryptographicOperations.FixedTimeEquals(
            Encoding.ASCII.GetBytes(hex),
            Encoding.ASCII.GetBytes(signature.ToLowerInvariant()));
    }

    public Task<string> RefundAsync(string providerPaymentId, long amountMinor)
    {
        var client = new RazorpayClient(_keyId, _keySecret);
        var options = new Dictionary<string, object> { { "amount", amountMinor } };
        var payment = client.Payment.Fetch(providerPaymentId);
        var refund = payment.Refund(options);
        return Task.FromResult((string)refund["id"]);
    }
}
