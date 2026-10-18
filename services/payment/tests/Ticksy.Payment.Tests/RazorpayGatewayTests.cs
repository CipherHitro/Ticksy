using System.Security.Cryptography;
using System.Text;
using Microsoft.Extensions.Configuration;
using Ticksy.Payment.Api.Gateways;

namespace Ticksy.Payment.Tests;

public class RazorpayGatewayTests
{
    private const string TestKeyId = "rzp_test_12345678";
    private const string TestKeySecret = "test_secret_key_87654321";
    private const string TestWebhookSecret = "webhook_secret_99999999";

    private readonly IRazorpayGateway _gateway;

    public RazorpayGatewayTests()
    {
        var config = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["Razorpay:KeyId"] = TestKeyId,
                ["Razorpay:KeySecret"] = TestKeySecret,
                ["Razorpay:WebhookSecret"] = TestWebhookSecret
            })
            .Build();

        _gateway = new RazorpayGateway(config);
    }

    [Fact]
    public void VerifyWebhookSignature_ValidSignature_ReturnsTrue()
    {
        var rawBody = "{\"event\":\"payment.captured\",\"payload\":{\"payment\":{\"id\":\"pay_123\"}}}";
        var keyBytes = Encoding.UTF8.GetBytes(TestWebhookSecret);
        var bodyBytes = Encoding.UTF8.GetBytes(rawBody);
        var expectedHash = Convert.ToHexString(HMACSHA256.HashData(keyBytes, bodyBytes)).ToLowerInvariant();

        var result = _gateway.VerifyWebhookSignature(rawBody, expectedHash);

        Assert.True(result);
    }

    [Fact]
    public void VerifyWebhookSignature_TamperedBody_ReturnsFalse()
    {
        var rawBody = "{\"event\":\"payment.captured\",\"payload\":{\"payment\":{\"id\":\"pay_123\"}}}";
        var keyBytes = Encoding.UTF8.GetBytes(TestWebhookSecret);
        var bodyBytes = Encoding.UTF8.GetBytes(rawBody);
        var validHash = Convert.ToHexString(HMACSHA256.HashData(keyBytes, bodyBytes)).ToLowerInvariant();

        var tamperedBody = "{\"event\":\"payment.captured\",\"payload\":{\"payment\":{\"id\":\"pay_456\"}}}";
        var result = _gateway.VerifyWebhookSignature(tamperedBody, validHash);

        Assert.False(result);
    }

    [Fact]
    public void VerifyWebhookSignature_TamperedSignature_ReturnsFalse()
    {
        var rawBody = "{\"event\":\"payment.captured\"}";
        var invalidSignature = "deadbeef00000000deadbeef00000000deadbeef00000000deadbeef00000000";

        var result = _gateway.VerifyWebhookSignature(rawBody, invalidSignature);

        Assert.False(result);
    }

    [Fact]
    public void VerifyWebhookSignature_EmptySignature_ReturnsFalse()
    {
        var rawBody = "{\"event\":\"payment.captured\"}";

        Assert.False(_gateway.VerifyWebhookSignature(rawBody, ""));
        Assert.False(_gateway.VerifyWebhookSignature(rawBody, "   "));
    }

    [Fact]
    public void VerifyPaymentSignature_ValidSignature_ReturnsTrue()
    {
        var orderId = "order_ABCD1234EFGH";
        var paymentId = "pay_WXYZ5678IJKL";
        var message = $"{orderId}|{paymentId}";
        var keyBytes = Encoding.UTF8.GetBytes(TestKeySecret);
        var msgBytes = Encoding.UTF8.GetBytes(message);
        var validSignature = Convert.ToHexString(HMACSHA256.HashData(keyBytes, msgBytes)).ToLowerInvariant();

        var result = _gateway.VerifyPaymentSignature(orderId, paymentId, validSignature);

        Assert.True(result);
    }

    [Fact]
    public void VerifyPaymentSignature_TamperedOrder_ReturnsFalse()
    {
        var orderId = "order_ABCD1234EFGH";
        var paymentId = "pay_WXYZ5678IJKL";
        var message = $"{orderId}|{paymentId}";
        var keyBytes = Encoding.UTF8.GetBytes(TestKeySecret);
        var msgBytes = Encoding.UTF8.GetBytes(message);
        var validSignature = Convert.ToHexString(HMACSHA256.HashData(keyBytes, msgBytes)).ToLowerInvariant();

        var result = _gateway.VerifyPaymentSignature("order_DIFFERENT", paymentId, validSignature);

        Assert.False(result);
    }
}
