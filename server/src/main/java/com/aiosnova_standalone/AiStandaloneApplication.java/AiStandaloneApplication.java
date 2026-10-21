package com.aiosnova_standalone;

import java.util.Map;

import com.aiosnova.ai.AiConnectionController;
import com.aiosnova.ai.AiConnectionService;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.EnableAutoConfiguration;
import org.springframework.boot.jdbc.autoconfigure.DataSourceAutoConfiguration;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Import;
import com.aiosnova.ai.AiModelController;
import com.aiosnova.ai.OpenRouterModelService;

@Configuration
@EnableAutoConfiguration(exclude = DataSourceAutoConfiguration.class)
@Import({
    AiConnectionController.class,
    AiConnectionService.class,
    AiModelController.class,
    OpenRouterModelService.class
})
public class AiStandaloneApplication {

    public static void main(String[] args) {
        SpringApplication app =
            new SpringApplication(AiStandaloneApplication.class);

        app.setDefaultProperties(Map.of(
            "spring.config.name", "application-ai-standalone"
        ));

        app.run(args);
    }
}
