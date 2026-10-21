package com.ticksy.booking.config;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.ticksy.booking.dto.ApiResponse;
import com.ticksy.booking.exception.ErrorCode;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.convert.converter.Converter;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.security.authentication.AbstractAuthenticationToken;
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.oauth2.core.DelegatingOAuth2TokenValidator;
import org.springframework.security.oauth2.core.OAuth2Error;
import org.springframework.security.oauth2.core.OAuth2TokenValidator;
import org.springframework.security.oauth2.core.OAuth2TokenValidatorResult;
import org.springframework.security.oauth2.jwt.*;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.security.web.SecurityFilterChain;

import java.util.ArrayList;
import java.util.Collection;
import java.util.List;
import java.util.UUID;

@Configuration
@EnableWebSecurity
@EnableMethodSecurity
public class SecurityConfig {

    private final ObjectMapper objectMapper;
    private final String jwksUrl;
    private final String issuer;
    private final String audience;

    public SecurityConfig(
            ObjectMapper objectMapper,
            @Value("${AUTH_JWKS_URL:http://localhost:4001/.well-known/jwks.json}") String jwksUrl,
            @Value("${JWT_ISSUER:ticksy-auth}") String issuer,
            @Value("${JWT_AUDIENCE:ticksy-api}") String audience) {
        this.objectMapper = objectMapper;
        this.jwksUrl = jwksUrl;
        this.issuer = issuer;
        this.audience = audience;
    }

    @Bean
    public SecurityFilterChain securityFilterChain(HttpSecurity http) throws Exception {
        http
                .csrf(AbstractHttpConfigurer::disable)
                .cors(AbstractHttpConfigurer::disable) // Handled exclusively at the Gateway
                .sessionManagement(s -> s.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .authorizeHttpRequests(auth -> auth
                        // Public routes per Ticksy spec
                        .requestMatchers(HttpMethod.GET, "/api/v1/bookings/events").permitAll()
                        .requestMatchers(HttpMethod.GET, "/api/v1/bookings/events/*/seats").permitAll()
                        .requestMatchers("/health/**", "/metrics", "/actuator/**").permitAll()
                        // All other booking endpoints require JWT
                        .requestMatchers("/api/v1/bookings/**").authenticated()
                        .anyRequest().authenticated()
                )
                .oauth2ResourceServer(oauth2 -> oauth2
                        .jwt(jwt -> jwt
                                .jwtAuthenticationConverter(jwtAuthenticationConverter())
                        )
                        .authenticationEntryPoint((request, response, authException) -> {
                            String requestId = request.getHeader("X-Request-Id");
                            if (requestId == null || requestId.isBlank()) {
                                requestId = UUID.randomUUID().toString();
                            }
                            response.setStatus(HttpServletResponse.SC_UNAUTHORIZED);
                            response.setContentType(MediaType.APPLICATION_JSON_VALUE);
                            response.setHeader("X-Request-Id", requestId);

                            ApiResponse<Void> error = ApiResponse.error(
                                    ErrorCode.UNAUTHENTICATED.name(),
                                    "Token missing, malformed, expired, or invalid: " + authException.getMessage(),
                                    requestId
                            );
                            response.getWriter().write(objectMapper.writeValueAsString(error));
                        })
                        .accessDeniedHandler((request, response, accessDeniedException) -> {
                            String requestId = request.getHeader("X-Request-Id");
                            if (requestId == null || requestId.isBlank()) {
                                requestId = UUID.randomUUID().toString();
                            }
                            response.setStatus(HttpServletResponse.SC_FORBIDDEN);
                            response.setContentType(MediaType.APPLICATION_JSON_VALUE);
                            response.setHeader("X-Request-Id", requestId);

                            ApiResponse<Void> error = ApiResponse.error(
                                    ErrorCode.FORBIDDEN.name(),
                                    "Access forbidden: insufficient role or permission",
                                    requestId
                            );
                            response.getWriter().write(objectMapper.writeValueAsString(error));
                        })
                );

        return http.build();
    }

    @Bean
    public JwtDecoder jwtDecoder() {
        NimbusJwtDecoder decoder = NimbusJwtDecoder.withJwkSetUri(jwksUrl).build();

        OAuth2TokenValidator<Jwt> withIssuer = JwtValidators.createDefaultWithIssuer(issuer);
        OAuth2TokenValidator<Jwt> withAudience = new AudienceValidator(audience);
        OAuth2TokenValidator<Jwt> combined = new DelegatingOAuth2TokenValidator<>(withIssuer, withAudience);

        decoder.setJwtValidator(combined);
        return decoder;
    }

    private Converter<Jwt, ? extends AbstractAuthenticationToken> jwtAuthenticationConverter() {
        return jwt -> {
            Collection<GrantedAuthority> authorities = new ArrayList<>();

            // Map custom 'role' claim (ATTENDEE, ORGANIZER, ADMIN) to Spring Security authorities (ROLE_*)
            String role = jwt.getClaimAsString("role");
            if (role != null && !role.isBlank()) {
                authorities.add(new SimpleGrantedAuthority("ROLE_" + role.toUpperCase()));
            }

            return new JwtAuthenticationToken(jwt, authorities, jwt.getSubject());
        };
    }

    static class AudienceValidator implements OAuth2TokenValidator<Jwt> {
        private final String expectedAudience;

        public AudienceValidator(String expectedAudience) {
            this.expectedAudience = expectedAudience;
        }

        @Override
        public OAuth2TokenValidatorResult validate(Jwt jwt) {
            List<String> audiences = jwt.getAudience();
            if (audiences != null && audiences.contains(expectedAudience)) {
                return OAuth2TokenValidatorResult.success();
            }
            return OAuth2TokenValidatorResult.failure(new OAuth2Error("invalid_token", "The required audience is missing", null));
        }
    }
}
