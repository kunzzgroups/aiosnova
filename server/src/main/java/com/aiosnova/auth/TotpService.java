package com.aiosnova.auth;

import java.net.URLEncoder;
import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.time.Instant;
import java.util.Locale;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;

import com.google.zxing.BarcodeFormat;
import com.google.zxing.WriterException;
import com.google.zxing.common.BitMatrix;
import com.google.zxing.qrcode.QRCodeWriter;
import org.springframework.stereotype.Service;

@Service
public class TotpService {

    private final SecureRandom random = new SecureRandom();

    public byte[] createSecret() {
        byte[] secret = new byte[20];
        random.nextBytes(secret);
        return secret;
    }

    public Setup setup(byte[] secret, String email) throws WriterException {
        String encoded = base32(secret);
        String label = URLEncoder.encode("AIOS Nova:" + email, StandardCharsets.UTF_8).replace("+", "%20");
        String uri = "otpauth://totp/" + label + "?secret=" + encoded
                + "&issuer=AIOS%20Nova&algorithm=SHA1&digits=6&period=30";
        BitMatrix matrix = new QRCodeWriter().encode(uri, BarcodeFormat.QR_CODE, 0, 0);
        StringBuilder path = new StringBuilder();
        for (int y = 0; y < matrix.getHeight(); y++) {
            for (int x = 0; x < matrix.getWidth(); x++) {
                if (matrix.get(x, y)) path.append('M').append(x).append(' ').append(y).append("h1v1h-1z");
            }
        }
        String svg = "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 "
                + matrix.getWidth() + " " + matrix.getHeight()
                + "\" shape-rendering=\"crispEdges\"><rect width=\"100%\" height=\"100%\" fill=\"white\"/>"
                + "<path fill=\"black\" d=\"" + path + "\"/></svg>";
        return new Setup(encoded, svg);
    }

    public long verify(byte[] secret, String code, long lastCounter) throws GeneralSecurityException {
        if (code == null || !code.matches("[0-9]{6}")) return -1;
        long current = Instant.now().getEpochSecond() / 30;
        for (long counter = current - 1; counter <= current + 1; counter++) {
            if (counter <= lastCounter) continue;
            if (MessageDigest.isEqual(generate(secret, counter).getBytes(StandardCharsets.US_ASCII),
                    code.getBytes(StandardCharsets.US_ASCII))) return counter;
        }
        return -1;
    }

    // RFC 6238: HMAC-SHA1, dynamic truncation, six decimal digits.
    String generate(byte[] secret, long counter) throws GeneralSecurityException {
        Mac mac = Mac.getInstance("HmacSHA1");
        mac.init(new SecretKeySpec(secret, "HmacSHA1"));
        byte[] hash = mac.doFinal(ByteBuffer.allocate(8).putLong(counter).array());
        int offset = hash[hash.length - 1] & 15;
        int value = ByteBuffer.wrap(hash, offset, 4).getInt() & 0x7fffffff;
        return String.format(Locale.ROOT, "%06d", value % 1_000_000);
    }

    private String base32(byte[] bytes) {
        String alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
        StringBuilder encoded = new StringBuilder();
        int buffer = 0;
        int bits = 0;
        for (byte value : bytes) {
            buffer = (buffer << 8) | (value & 255);
            bits += 8;
            while (bits >= 5) {
                bits -= 5;
                encoded.append(alphabet.charAt((buffer >>> bits) & 31));
            }
        }
        if (bits > 0) encoded.append(alphabet.charAt((buffer << (5 - bits)) & 31));
        return encoded.toString();
    }

    public record Setup(String secret, String qrCodeSvg) {
    }
}
