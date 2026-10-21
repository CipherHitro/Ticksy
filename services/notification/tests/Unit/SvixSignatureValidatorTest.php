<?php

declare(strict_types=1);

namespace Tests\Unit;

use App\Http\Exceptions\ApiException;
use App\Infrastructure\Webhooks\SvixSignatureValidator;
use PHPUnit\Framework\TestCase;

class SvixSignatureValidatorTest extends TestCase
{
    private string $secret;

    private string $body = '{"type":"email.delivered","data":{"email_id":"re_123"}}';

    private string $svixId = 'msg_p5jXN8AQ9njAHUpzQDmGgahb';

    protected function setUp(): void
    {
        parent::setUp();
        $this->secret = 'whsec_'.base64_encode('test_mock_webhook_secret_key_1234');
    }

    /**
     * U-07: Valid signature passes.
     */
    public function test_u07_valid_signature_passes(): void
    {
        $timestamp = time();
        $signature = SvixSignatureValidator::generateSignature($this->body, $this->svixId, $timestamp, $this->secret);

        SvixSignatureValidator::validate(
            $this->body,
            $this->svixId,
            (string) $timestamp,
            $signature,
            $this->secret
        );

        $this->assertTrue(true); // Reached without exception
    }

    /**
     * U-07: Wrong secret throws 401 UNAUTHENTICATED.
     */
    public function test_u07_wrong_secret_throws_unauthenticated(): void
    {
        $timestamp = time();
        $wrongSecret = 'whsec_'.base64_encode('wrong_mock_webhook_secret_key_5678');
        $signature = SvixSignatureValidator::generateSignature($this->body, $this->svixId, $timestamp, $wrongSecret);

        $this->expectException(ApiException::class);
        $this->expectExceptionCode(401);

        SvixSignatureValidator::validate(
            $this->body,
            $this->svixId,
            (string) $timestamp,
            $signature,
            $this->secret
        );
    }

    /**
     * U-07: Tampered body throws 401 UNAUTHENTICATED.
     */
    public function test_u07_tampered_body_throws_unauthenticated(): void
    {
        $timestamp = time();
        $signature = SvixSignatureValidator::generateSignature($this->body, $this->svixId, $timestamp, $this->secret);
        $tamperedBody = $this->body.' ';

        $this->expectException(ApiException::class);
        $this->expectExceptionCode(401);

        SvixSignatureValidator::validate(
            $tamperedBody,
            $this->svixId,
            (string) $timestamp,
            $signature,
            $this->secret
        );
    }

    /**
     * U-07: Timestamp older than 300s throws 401 UNAUTHENTICATED.
     */
    public function test_u07_old_timestamp_throws_unauthenticated(): void
    {
        $oldTimestamp = time() - 360; // 6 minutes ago
        $signature = SvixSignatureValidator::generateSignature($this->body, $this->svixId, $oldTimestamp, $this->secret);

        $this->expectException(ApiException::class);
        $this->expectExceptionCode(401);

        SvixSignatureValidator::validate(
            $this->body,
            $this->svixId,
            (string) $oldTimestamp,
            $signature,
            $this->secret
        );
    }

    /**
     * U-07: Multi-signature header where one matches passes.
     */
    public function test_u07_multi_signature_header_one_valid_passes(): void
    {
        $timestamp = time();
        $validSig = SvixSignatureValidator::generateSignature($this->body, $this->svixId, $timestamp, $this->secret);
        $multiHeader = "v1,invalidsignature12345 {$validSig} v1,anotherinvalidsignature";

        SvixSignatureValidator::validate(
            $this->body,
            $this->svixId,
            (string) $timestamp,
            $multiHeader,
            $this->secret
        );

        $this->assertTrue(true);
    }
}
