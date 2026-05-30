package com.moya.portal.banked.common.security;

import java.io.IOException;
import java.util.List;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;
import org.springframework.web.server.ResponseStatusException;

@Component
public class JwtAuthenticationFilter extends OncePerRequestFilter {

	private final JwtService jwtService;
	private final ObjectProvider<LocalDriveUserService> localDriveUserService;

	public JwtAuthenticationFilter(JwtService jwtService, ObjectProvider<LocalDriveUserService> localDriveUserService) {
		this.jwtService = jwtService;
		this.localDriveUserService = localDriveUserService;
	}

	@Override
	protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain filterChain)
			throws ServletException, IOException {
		String authorization = request.getHeader(HttpHeaders.AUTHORIZATION);
		CurrentUser currentUser = null;
		if (authorization != null && authorization.startsWith("Bearer ")) {
			try {
				currentUser = jwtService.parse(authorization.substring(7));
			} catch (ResponseStatusException ex) {
				response.sendError(HttpStatus.UNAUTHORIZED.value(), ex.getReason());
				return;
			}
		} else if (usesLocalDriveUser(request)) {
			LocalDriveUserService service = localDriveUserService.getIfAvailable();
			if (service != null) {
				currentUser = service.currentUser();
			}
		}
		if (currentUser != null) {
			UsernamePasswordAuthenticationToken authentication = new UsernamePasswordAuthenticationToken(currentUser, null, List.of());
			SecurityContextHolder.getContext().setAuthentication(authentication);
		}
		filterChain.doFilter(request, response);
	}

	private boolean usesLocalDriveUser(HttpServletRequest request) {
		String path = request.getRequestURI();
		return path.startsWith("/api/drive") || path.startsWith("/api/share");
	}
}
