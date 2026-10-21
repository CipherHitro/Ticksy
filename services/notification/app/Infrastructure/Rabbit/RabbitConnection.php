<?php

declare(strict_types=1);

namespace App\Infrastructure\Rabbit;

use PhpAmqpLib\Connection\AMQPStreamConnection;

class RabbitConnection
{
    private static ?AMQPStreamConnection $connection = null;

    public static function create(): AMQPStreamConnection
    {
        $host = (string) config('notification.rabbitmq.host', '127.0.0.1');
        $port = (int) config('notification.rabbitmq.port', 5672);
        $user = (string) config('notification.rabbitmq.user', 'guest');
        $password = (string) config('notification.rabbitmq.password', 'guest');
        $vhost = (string) config('notification.rabbitmq.vhost', '/');

        return new AMQPStreamConnection(
            $host,
            $port,
            $user,
            $password,
            $vhost,
            false,
            'AMQPLAIN',
            null,
            'en_US',
            3.0, // connection timeout
            3.0, // read/write timeout
            null,
            false,
            30 // heartbeat
        );
    }

    public static function getShared(): AMQPStreamConnection
    {
        if (self::$connection === null || ! self::$connection->isConnected()) {
            self::$connection = self::create();
        }

        return self::$connection;
    }

    public static function close(): void
    {
        if (self::$connection !== null && self::$connection->isConnected()) {
            try {
                self::$connection->close();
            } catch (\Throwable) {
            }
            self::$connection = null;
        }
    }
}
